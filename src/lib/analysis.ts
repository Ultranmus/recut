import { enforceRules, learningsPrompt, rulesPrompt, type BrandRule, type Learning } from "./brand-rules";
import { PLATFORMS, type Analysis, type Clip, type PlatformId, type Segment, type Transcript } from "./types";

/**
 * Shared clip-finding logic. Runs in the browser (user-supplied key, straight to Groq)
 * and on the server (env key, via /api/analyze), so it must stay isomorphic.
 */

export const GROQ_BASE = "https://api.groq.com/openai/v1";
export const ANALYSIS_MODEL = "openai/gpt-oss-120b";
export const TRANSCRIBE_MODEL = "whisper-large-v3-turbo";

const MIN_CLIP = 18;

/** Short uploads can't hold five 30-second clips, so clip targets scale with the episode. */
function clipBounds(duration: number) {
  if (duration >= 300) return { min: MIN_CLIP, low: 25, high: 75, ideal: "30-60", want: 0 };
  if (duration >= 120) return { min: 12, low: 15, high: 45, ideal: "20-35", want: 5 };
  return { min: 6, low: 8, high: 30, ideal: "10-20", want: 3 };
}
const MAX_CLIP = 90;
export const MIN_CLIPS = 5;
export const MAX_CLIPS = 8;

/** Words per analysis window. Sized so prompt (~2.5k tokens) + output budget stays under Groq's free-tier 8k TPM. */
const WINDOW_WORDS = 1700;

type Window = { segments: Segment[]; index: number; count: number };

function windowsFor(t: Transcript): Window[] {
  const groups: Segment[][] = [[]];
  let words = 0;
  for (const s of t.segments) {
    const n = s.text.split(/\s+/).length;
    if (words + n > WINDOW_WORDS && groups[groups.length - 1].length) {
      groups.push([]);
      words = 0;
    }
    groups[groups.length - 1].push(s);
    words += n;
  }
  // Fold a tiny trailing window into the previous one.
  if (groups.length > 1 && groups[groups.length - 1].reduce((a, s) => a + s.text.length, 0) < 1500) {
    groups[groups.length - 2].push(...groups.pop()!);
  }
  return groups.map((segments, index) => ({ segments, index, count: groups.length }));
}

export function buildAnalysisRequest(
  w: Window,
  transcript: Transcript,
  name: string,
  rules: BrandRule[] = [],
  learnings: Learning[] = []
) {
  const lines = w.segments.map((s) => `[${Math.round(s.start)}] ${s.text}`).join("\n");
  const last = w.segments[w.segments.length - 1];
  // Aim for 5-8 clips overall; extra candidates from long episodes are ranked and trimmed later.
  // Models treat ranges as permission to return the minimum, so ask each part for an exact count.
  const bounds = clipBounds(transcript.duration);
  const want = bounds.want || (w.count === 1 ? 7 : w.count === 2 ? 4 : 3);
  const part =
    w.count === 1
      ? "the full transcript"
      : `part ${w.index + 1} of ${w.count} of the transcript (${Math.round(w.segments[0].start)}s to ${Math.round(last.end)}s)`;

  const system = `You are a senior social video editor who repurposes long-form podcasts into short vertical clips.
You pick moments that stand on their own, open with a strong hook, and end on a complete thought.
You write native-sounding captions that match each platform's length and tone. Respond with JSON only.`;

  const user = `Episode: "${name}" (${Math.round(transcript.duration)}s total). Below is ${part}; each line starts with its start time in seconds and ends where the next line starts (the last line ends at ${Math.round(last.end)}).

${lines}

Return JSON:
{"title":"punchy episode title","summary":"2 sentence summary","topics":["3-5 short tags"],
"clips":[{"title":"max 6 words","start":<line start time>,"end":<line end time>,"hook":"on-screen hook, max 8 words","why":"one sentence on why it will perform","score":<0-100 virality>,
"captions":{
 "reels":"Instagram Reels caption: line 1 is a scroll-stopping hook under 125 characters (all viewers see before 'more'). Then a blank line, 1-2 short lines of context, a blank line, a save or follow call to action, and 3-5 hashtags on the last line. Casual, 1-3 emojis. 200-450 characters total.",
 "linkedin":"LinkedIn post of 600-1100 characters: a 1-sentence opening line under 200 characters that earns the 'see more' click, then 3 short paragraphs separated by blank lines (what was said, why it matters, the lesson for professionals), then a closing question, then up to 3 hashtags. At most 1 emoji.",
 "x":"One X post, at most 270 characters including hashtags. Punchy and opinionated, one idea, 0-1 hashtag, no thread.",
 "shorts":"YouTube Shorts title, at most 90 characters, curiosity-driven and searchable, ending with #Shorts."},
"hashtags":["5 tags without #"]}]}

Rules:
- Return exactly ${want} clips, best first, each ${bounds.low}-${bounds.high} seconds long (end minus start, ideally ${bounds.ideal}), no overlaps. Include enough lines for the setup and the payoff.
- "why" must name the specific thing that makes this moment work (the surprising fact, the story, the strong claim), not generic praise.
- Skip ads, subscribe reminders, intros, outros and credits. Only return fewer than ${want} if this part truly has no other self-contained moment.
- Start where a sentence starts; end on a complete thought. Favor surprising facts, strong opinions, stories, quotable lines.
- Captions must be faithful to what is said: check every name, number and who-did-what against the transcript lines. Never invent facts or quotes.${
    rules.length ? `\n\nThe creator's Brand Memory. Every caption MUST follow these rules; they override the platform style notes above:\n${rulesPrompt(rules)}` : ""
  }${
    learnings.length
      ? `\n\nHow this creator's past clips actually performed. Rank and score with this in mind: score moments that resemble past hits higher and ones that resemble flops lower, and say so in "why" when a learning influenced the pick. Only cite results listed here; never claim a past result that isn't in this list:\n${learningsPrompt(learnings)}`
      : ""
  }`;

  return {
    model: ANALYSIS_MODEL,
    temperature: 0.4,
    max_completion_tokens: 4800,
    reasoning_effort: "medium",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Each Groq model has its own per-minute token allowance (8k on the free tier). When the preferred
 * model is rate-limited we switch to the next one instead of waiting, and only wait if all are busy.
 */
export const MODEL_CHAIN = [ANALYSIS_MODEL, "qwen/qwen3.8-27b", "openai/gpt-oss-20b"];
const limitedUntil = new Map<string, number>();

function forModel(body: Record<string, unknown>, model: string) {
  const out: Record<string, unknown> = { ...body, model };
  // Qwen accepts "low" and "default" rather than gpt-oss's low/medium/high scale.
  if (model.startsWith("qwen/") && out.reasoning_effort && out.reasoning_effort !== "low") out.reasoning_effort = "default";
  return out;
}

/**
 * Sends a chat request in JSON mode and parses the reply. Falls back across models on rate limits
 * and retries the occasional invalid-JSON generation, since both are transient on Groq's free tier.
 */
export async function groqJSON(body: Record<string, unknown>, apiKey: string): Promise<Record<string, unknown>> {
  const chain = [String(body.model), ...MODEL_CHAIN.filter((m) => m !== body.model)];
  let badJson = 0;
  for (let attempt = 0; attempt < 12; attempt++) {
    const now = Date.now();
    const model = chain.find((m) => (limitedUntil.get(m) ?? 0) <= now);
    if (!model) {
      const soonest = Math.min(...chain.map((m) => limitedUntil.get(m) ?? now));
      await sleep(Math.max(500, soonest - now));
      continue;
    }
    const res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(forModel(body, model)),
    });
    if (res.status === 429 || res.status === 503) {
      const retry = Number(res.headers.get("retry-after"));
      limitedUntil.set(model, Date.now() + (Number.isFinite(retry) && retry > 0 ? retry + 1 : 15) * 1000);
      continue;
    }
    if (!res.ok) {
      const msg = await groqError(res);
      // Groq rejects malformed JSON as "failed to generate/validate JSON". It's transient: retry, and
      // after two misses on one model, give the next model a turn.
      if (res.status === 400 && /failed to (generate|validate) json|json_validate_failed|tool_use_failed/i.test(msg) && badJson++ < 4) {
        if (badJson >= 2) limitedUntil.set(model, Date.now() + 20_000);
        continue;
      }
      // A request too large for one model's per-minute budget: try the next model.
      if (res.status === 413) {
        limitedUntil.set(model, Date.now() + 60_000);
        continue;
      }
      throw new Error(msg);
    }
    const data = await res.json();
    try {
      return JSON.parse(data?.choices?.[0]?.message?.content ?? "") as Record<string, unknown>;
    } catch (err) {
      if (badJson++ < 2) continue;
      throw err;
    }
  }
  throw new Error("Groq is busy right now. Try again in a minute.");
}

/** Finds clips window by window via Groq, then merges and validates them. */
export async function runAnalysis(
  transcript: Transcript,
  name: string,
  apiKey: string,
  onProgress?: (done: number, total: number) => void,
  rules: BrandRule[] = [],
  learnings: Learning[] = []
): Promise<Analysis> {
  const windows = windowsFor(transcript);
  const parts: Record<string, unknown>[] = [];
  let lastError: unknown = null;
  for (const w of windows) {
    onProgress?.(w.index, windows.length);
    try {
      parts.push(await groqJSON(buildAnalysisRequest(w, transcript, name, rules, learnings), apiKey));
    } catch (err) {
      // One bad stretch of a long episode shouldn't throw away the clips found in the rest.
      lastError = err;
    }
  }
  if (!parts.length) throw lastError ?? new Error("Analysis failed.");
  onProgress?.(windows.length, windows.length);
  const first = parts[0] ?? {};
  const analysis = normalizeAnalysis(
    {
      title: first.title,
      summary: first.summary,
      topics: [...new Set(parts.flatMap((p) => (Array.isArray(p.topics) ? p.topics : [])))],
      clips: parts.flatMap((p) => (Array.isArray(p.clips) ? p.clips : [])),
    },
    transcript
  );
  for (const c of analysis.clips) {
    for (const p of PLATFORMS) c.captions[p.id] = fitLimit(enforceRules(c.captions[p.id], rules, p.id), p.limit);
  }
  return analysis;
}

export async function groqError(res: Response) {
  let msg = `Groq request failed (${res.status})`;
  try {
    const body = await res.json();
    if (body?.error?.message) msg = body.error.message;
  } catch {}
  if (res.status === 401) msg = "Invalid Groq API key. Check it in Settings.";
  if (res.status === 413 && !msg.includes("tokens")) msg = "That request was too large for Groq.";
  if (res.status === 429) msg = "Groq rate limit reached. Wait a moment and try again.";
  return msg;
}

function nearest(segments: Segment[], t: number, key: "start" | "end") {
  let best = segments[0];
  for (const s of segments) if (Math.abs(s[key] - t) < Math.abs(best[key] - t)) best = s;
  return best;
}

/** Trims at a word boundary so a caption never exceeds a platform's hard cap. */
export function fitLimit(text: string, limit: number) {
  if (text.length <= limit) return text;
  const tag = text.match(/\s(#\w+)$/)?.[1] ?? "";
  const room = limit - (tag ? tag.length + 1 : 0) - 1;
  return `${text.slice(0, room).replace(/\s+\S*$/, "")}…${tag ? " " + tag : ""}`;
}

function str(v: unknown, fallback = "") {
  return typeof v === "string" ? v.trim() : fallback;
}

export function normalizeAnalysis(raw: unknown, transcript: Transcript): Analysis {
  const r = (raw ?? {}) as Record<string, unknown>;
  const segs = transcript.segments;
  const rawClips = (Array.isArray(r.clips) ? (r.clips as Record<string, unknown>[]) : [])
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));

  const clips: Clip[] = [];
  for (const c of rawClips) {
    if (clips.length >= MAX_CLIPS) break;
    const s = Number(c.start);
    const e = Number(c.end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s || !segs.length) continue;
    const start = nearest(segs, s, "start").start;
    let end = nearest(segs, e, "end").end;
    if (end - start > MAX_CLIP) end = nearest(segs, start + MAX_CLIP - 5, "end").end;
    if (end - start < clipBounds(transcript.duration).min) continue;
    if (clips.some((k) => start < k.end && end > k.start)) continue;

    const cap = (c.captions ?? {}) as Record<string, unknown>;
    const captions = Object.fromEntries(
      PLATFORMS.map((p) => [p.id, fitLimit(str(cap[p.id]), p.limit)])
    ) as Record<PlatformId, string>;
    clips.push({
      id: `clip-${clips.length + 1}`,
      title: str(c.title, `Clip ${clips.length + 1}`),
      start,
      end,
      hook: str(c.hook),
      why: str(c.why),
      score: Math.max(0, Math.min(100, Math.round(Number(c.score) || 70))),
      captions,
      hashtags: (Array.isArray(c.hashtags) ? c.hashtags : [])
        .map((h) => String(h).replace(/^#/, "").replace(/\s+/g, ""))
        .filter(Boolean)
        .slice(0, 8),
    });
  }

  if (!clips.length) return fallbackAnalysis(transcript, str(r.title));

  // Top up to the minimum with transcript-signal picks that don't overlap the AI's choices.
  if (clips.length < MIN_CLIPS) {
    for (const extra of fallbackAnalysis(transcript).clips) {
      if (clips.length >= MIN_CLIPS) break;
      if (clips.some((k) => extra.start < k.end && extra.end > k.start)) continue;
      clips.push({ ...extra, score: Math.min(extra.score, Math.min(...clips.map((c) => c.score)) - 1) });
    }
  }

  clips.sort((a, b) => b.score - a.score);
  clips.forEach((c, i) => (c.id = `clip-${i + 1}`));
  return {
    title: str(r.title, "Untitled episode"),
    summary: str(r.summary),
    topics: (Array.isArray(r.topics) ? r.topics : []).map(String).slice(0, 6),
    clips,
  };
}

const SIGNALS = /\b(here's the thing|the problem|the reason|the key|interesting|amazing|never|always|first|biggest|why|secret|truth|imagine|remember|actually|important)\b|\d/gi;

/** Keyword/structure heuristic used when the LLM call fails, so the studio never dead-ends. */
export function fallbackAnalysis(transcript: Transcript, title = ""): Analysis {
  const segs = transcript.segments;
  const lead = Math.min(60, transcript.duration * 0.08);
  const span = Math.min(50, Math.max(10, transcript.duration * 0.3));
  const windows: { start: number; end: number; text: string; score: number }[] = [];
  for (let i = 0; i < segs.length; i++) {
    if (segs[i].start < lead || segs[i].start > transcript.duration - lead) continue;
    let j = i;
    while (j + 1 < segs.length && segs[j + 1].end - segs[i].start <= span) j++;
    const dur = segs[j].end - segs[i].start;
    if (dur < Math.min(25, span * 0.5)) continue;
    const text = segs.slice(i, j + 1).map((s) => s.text).join(" ");
    const hits = text.match(SIGNALS)?.length ?? 0;
    const opener = /^[A-Z]/.test(segs[i].text) ? 2 : 0;
    windows.push({ start: segs[i].start, end: segs[j].end, text, score: hits * 3 + opener + (text.includes("?") ? 3 : 0) });
  }
  windows.sort((a, b) => b.score - a.score);
  const picked: typeof windows = [];
  for (const w of windows) {
    if (picked.length >= MAX_CLIPS) break;
    if (picked.some((p) => w.start < p.end && w.end > p.start)) continue;
    picked.push(w);
  }
  const top = picked[0]?.score || 1;
  const clips: Clip[] = picked.map((w, i) => {
    const first = (w.text.match(/[^.!?]+[.!?]/)?.[0] ?? w.text).trim();
    const hook = first.split(/\s+/).slice(0, 8).join(" ");
    const quote = first.length > 200 ? first.slice(0, 197) + "…" : first;
    return {
      id: `clip-${i + 1}`,
      title: `Highlight ${i + 1}`,
      start: w.start,
      end: w.end,
      hook,
      why: "Picked from transcript signals: concrete details, numbers and strong statements.",
      score: Math.round(60 + (w.score / top) * 30),
      captions: {
        reels: `${quote}\n\nSave this for later and follow for more 🎧\n\n#podcast #reels #clips`,
        linkedin: `"${quote}"\n\nOne moment from this episode that stuck with me. What's your take?`,
        x: fitLimit(`"${quote}"`, 280),
        shorts: fitLimit(`${hook} #Shorts`, 100),
      },
      hashtags: ["podcast", "clips", "shorts"],
    };
  });
  return { title: title || "Untitled episode", summary: "", topics: [], clips };
}
