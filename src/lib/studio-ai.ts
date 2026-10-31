import { ANALYSIS_MODEL, fitLimit, groqJSON } from "./analysis";
import {
  enforceRules,
  fixRepeatedName,
  learningsPrompt,
  lintCaption,
  rulesFor,
  rulesPrompt,
  scopeForLearnedRule,
  type BrandRule,
  type Learning,
} from "./brand-rules";
import { PLATFORMS, type PlatformId } from "./types";

/**
 * The "Talk to your studio" brain. Isomorphic like analysis.ts: runs in the browser with the
 * user's own key, or behind /api/studio with the server key. Prompts are always built here,
 * never accepted from the client, so the server key can't be used as an open LLM proxy.
 */

const PLATFORM_IDS = PLATFORMS.map((p) => p.id) as PlatformId[];

export type ClipRef = { id: string; title: string; hook: string; start: number; end: number; why?: string; score?: number };

export type BriefSchedule = { clipId: string; clipQuery: string; date: string; time: string; platforms: PlatformId[] };

export type BriefFeedback = {
  clipId: string;
  clipQuery: string;
  platform: PlatformId | "";
  views: number | null;
  outcome: Learning["outcome"];
  metric: string;
  lesson: string;
};

export type ParsedBrief = {
  cleaned: string;
  wantsCaptions: boolean;
  topic: string;
  clipIds: string[];
  platforms: PlatformId[];
  tone: string;
  rules: string[];
  schedule: BriefSchedule[];
  feedback: BriefFeedback[];
  corrections: { from: string; to: string }[];
  fillers: string[];
  digressions: string[];
};

export type RewriteMode = "brief" | "rules";

export type RewriteInput = {
  mode: RewriteMode;
  clipText: string;
  captions: Partial<Record<PlatformId, string>>;
  platforms: PlatformId[];
  tone?: string;
  topic?: string;
  instructions?: string;
  rules: BrandRule[];
};

export type RewriteResult = Partial<Record<PlatformId, { text: string; reason: string }>>;

export type RerankResult = Record<string, { score: number; reason: string }>;

const asStrings = (v: unknown, max = 12) => (Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean).slice(0, max) : []);
const asString = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const asPlatforms = (v: unknown) => asStrings(v, 4).filter((p): p is PlatformId => PLATFORM_IDS.includes(p as PlatformId));
const asObjects = (v: unknown) => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : []);

function chat(system: string, user: string, maxTokens: number, effort: "low" | "medium" = "low") {
  return {
    model: ANALYSIS_MODEL,
    temperature: 0.3,
    max_completion_tokens: maxTokens,
    reasoning_effort: effort,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
}

export async function parseBrief(
  raw: string,
  clips: ClipRef[],
  rules: BrandRule[],
  dates: string,
  apiKey: string
): Promise<ParsedBrief> {
  const system = `You are the producer who takes a creator's spoken brief and turns it into clear instructions for a video editor.
The brief was dictated (e.g. with Wispr Flow) so it may contain filler words and self-corrections. Respond with JSON only.`;

  const user = `Spoken brief, verbatim:
"""${raw.slice(0, 4000)}"""

Clips in this episode (id | title | hook):
${clips.map((c) => `${c.id} | ${c.title} | ${c.hook}`).join("\n")}

Platforms: reels (Instagram Reels), linkedin (LinkedIn), x (X / Twitter), shorts (YouTube Shorts).

Calendar, the next 14 days (day number: date):
${dates}

Brand rules already saved:
${rulesPrompt(rules) || "(none)"}

Return JSON:
{"cleaned":"the brief rewritten as 1-3 clear sentences, fillers removed and corrections applied",
"wantsCaptions":<true only if the creator asked to write, rewrite or restyle captions/posts>,
"topic":"what the creator wants content written about, only if they asked for captions/posts; otherwise empty string",
"clipIds":["ids of the clips that best match the topic, best first, max 3; [] if no topic"],
"platforms":["subset of reels|linkedin|x|shorts the creator wants captions for; [] means all"],
"tone":"tone the creator explicitly described, or empty string; never infer one",
"rules":["NEW lasting brand rules as short imperative sentences, e.g. 'Never use emojis.'"],
"schedule":[{"clipQuery":"how they referred to the clip","clipId":"matching id or empty","day":<day number from the calendar list above>,"time":"HH:MM 24h or empty","platforms":["platform ids, [] if unspecified"]}],
"feedback":[{"clipQuery":"how they referred to the clip","clipId":"matching id or empty","platform":"platform id or empty","views":<number or null>,"outcome":"hit|average|flop","metric":"the result in a few words, e.g. '40K views'","lesson":"one generalizable takeaway about what works or doesn't for this creator, based on the clip's topic and hook, max 20 words"}],
"corrections":[{"from":"what they first said","to":"what they settled on"}],
"fillers":["distinct filler words or phrases you ignored, max 8"],
"digressions":["off-topic tangents you set aside, each paraphrased in under 8 words, e.g. 'aside about their cat'"]}

How to read the brief:
- Ignore fillers (um, uh, like, you know, so, basically, I mean, kind of, sort of, okay so) and false starts.
- Digressions: set aside tangents that aren't instructions (stories, asides, thinking out loud, unrelated chatter). List them in "digressions" and never act on them.
- Self-corrections: the LAST version wins. Phrases like "no wait", "actually", "scratch that", "sorry", "I mean", "make that", "not X, Y" replace what came before. Record each one in "corrections" and never act on the replaced part.
- A brand rule must hold for all future content: words like always, never, every time, from now on, our brand, we don't, no <thing>. A one-off request for this post ("make this one funny") is tone, not a rule.
- "Post/schedule X on <day>" is a schedule entry. Resolve weekdays and relative days ("Tuesday", "tomorrow", "next Friday") to a day number from the calendar list; a bare weekday means its next occurrence (today counts if it is that day).
- "It got N views", "it did great", "it flopped", "nobody watched" is feedback. Spoken numbers become digits ("forty thousand" = 40000). outcome: hit for strong results or praise, flop for poor results, average otherwise. If no clip is named, use the clip the brief is about, else leave clipId empty.
- Match clips by meaning, not exact words; clipId must be an id from the clip list (like "clip-3"). Leave it empty if nothing fits.
- Don't repeat rules that are already saved; phrase rules so they make sense on their own.`;

  const r = await groqJSON(chat(system, user, 3500, "medium"), apiKey);
  const ids = new Set(clips.map((c) => c.id));
  // Smaller fallback models sometimes return a title or a near-miss; resolve against the real clips.
  const resolve = (id: unknown, query: unknown) => (ids.has(asString(id)) ? asString(id) : matchClip(`${asString(id)} ${asString(query)}`, clips));
  const dayDates = dates
    .split("\n")
    .map((l) => l.match(/^(\d+):.*?(\d{4}-\d{2}-\d{2})/))
    .filter((m): m is RegExpMatchArray => !!m);
  const dateFor = (day: unknown, date: unknown) => {
    const byIndex = dayDates.find((m) => Number(m[1]) === Number(day));
    if (byIndex && day !== null && day !== "" && day !== undefined) return byIndex[2];
    const iso = asString(date);
    return dayDates.some((m) => m[2] === iso) ? iso : "";
  };
  const corrections = asObjects(r.corrections)
    .map((c) => ({ from: asString(c.from), to: asString(c.to) }))
    .filter((c) => c.from || c.to)
    .slice(0, 6);
  const schedule = asObjects(r.schedule)
    .map((s) => ({
      clipId: resolve(s.clipId, s.clipQuery),
      clipQuery: asString(s.clipQuery),
      date: dateFor(s.day, s.date),
      time: /^\d{1,2}:\d{2}$/.test(asString(s.time)) ? asString(s.time).padStart(5, "0") : "",
      platforms: asPlatforms(s.platforms),
    }))
    .filter((s) => s.date)
    .slice(0, 10);
  const feedback = asObjects(r.feedback)
    .map((f) => {
      const views = Number(f.views);
      const outcome = ["hit", "average", "flop"].includes(asString(f.outcome)) ? (asString(f.outcome) as Learning["outcome"]) : "average";
      return {
        clipId: resolve(f.clipId, f.clipQuery),
        clipQuery: asString(f.clipQuery),
        platform: (PLATFORM_IDS.includes(asString(f.platform) as PlatformId) ? asString(f.platform) : "") as PlatformId | "",
        views: Number.isFinite(views) && views > 0 ? Math.round(views) : null,
        outcome,
        metric: asString(f.metric),
        lesson: asString(f.lesson),
      };
    })
    .slice(0, 10);

  return {
    cleaned: asString(r.cleaned),
    wantsCaptions: r.wantsCaptions === true,
    topic: asString(r.topic),
    clipIds: asStrings(r.clipIds, 3).filter((id) => ids.has(id)),
    platforms: asPlatforms(r.platforms),
    tone: asString(r.tone),
    rules: asStrings(r.rules, 8),
    schedule,
    feedback,
    corrections,
    fillers: asStrings(r.fillers, 8),
    digressions: asStrings(r.digressions, 5),
  };
}

const STOPWORDS = new Set(["the", "a", "an", "one", "clip", "bit", "part", "about", "on", "of", "and", "we", "that", "this", "it", "post", "posted", "video", "short", "s", "vs", "versus", "to", "in"]);
const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map((w) => (w.length > 3 ? w.replace(/(es|s)$/, "") : w));

/** Picks the clip whose title and hook share the most meaningful words with how the creator named it. */
export function matchClip(query: string, clips: ClipRef[]) {
  const q = new Set(tokens(query));
  if (!q.size) return "";
  let best = "";
  let bestScore = 0;
  for (const c of clips) {
    const words = new Set(tokens(`${c.title} ${c.hook}`));
    const score = [...q].filter((w) => words.has(w)).length;
    if (score > bestScore) {
      best = c.id;
      bestScore = score;
    }
  }
  return best;
}

function lintAll(out: RewriteResult, rules: BrandRule[]) {
  const issues: Partial<Record<PlatformId, string[]>> = {};
  for (const p of PLATFORMS) {
    const r = out[p.id];
    if (!r) continue;
    const found = lintCaption(r.text, rules, p.id, p.limit);
    if (found.length) issues[p.id] = found;
  }
  return issues;
}

export async function rewriteCaptions(input: RewriteInput, apiKey: string): Promise<RewriteResult> {
  const specs = PLATFORMS.filter((p) => input.platforms.includes(p.id))
    .map((p) => `- ${p.id} (${p.name}): max ${p.limit} chars; ${p.tone}`)
    .join("\n");
  const current = input.platforms.map((p) => `[${p}]\n${input.captions[p] ?? ""}`).join("\n\n");

  const task =
    input.mode === "brief"
      ? `Write a fresh caption for each platform following the creator's brief${input.tone ? ` (tone: ${input.tone})` : ""}${
          input.topic ? ` and focus on: ${input.topic}` : ""
        }.${input.instructions ? ` Brief: ${input.instructions}` : ""}`
      : `Make the smallest edit that brings each caption in line with every brand rule, then reread it: the result must read naturally and be grammatical, so rephrase the surrounding words when a rule requires it (never just splice words in, and never repeat a name in one sentence). If a caption already follows all rules, return it exactly unchanged.`;

  const system = `You are a social media editor who writes platform-native captions and follows a creator's brand rules exactly. Respond with JSON only.`;
  const base = `What is said in the clip (transcript):
"""${input.clipText.slice(0, 3000)}"""

Platform specs:
${specs}

Brand rules (mandatory, they override platform style):
${rulesPrompt(input.rules) || "(none)"}`;

  const user = `${base}

Current captions:
${current}

Task: ${task}

Return JSON: {"captions":{"<platform id>":"caption"}, "reasons":{"<platform id>":"which brief point or rule changed it, max 12 words"}}
Only include these platform ids: ${input.platforms.join(", ")}.
Stay faithful to the transcript; never invent facts, names or numbers.`;

  const collect = (r: Record<string, unknown>, into: RewriteResult, only: PlatformId[]) => {
    const caps = (r.captions ?? {}) as Record<string, unknown>;
    const reasons = (r.reasons ?? {}) as Record<string, unknown>;
    for (const p of PLATFORMS) {
      if (!only.includes(p.id)) continue;
      const text = asString(caps[p.id]);
      if (!text) continue;
      into[p.id] = {
        text: fitLimit(enforceRules(text, input.rules, p.id), p.limit),
        reason: into[p.id]?.reason || asString(reasons[p.id]) || (input.mode === "rules" ? "Brand rule" : "Your brief"),
      };
    }
  };

  const out: RewriteResult = {};
  collect(await groqJSON(chat(system, user, 4500, "medium"), apiKey), out, input.platforms);

  // Quality gate: captions that fail the deterministic checks go back with the exact problems.
  for (let round = 0; round < 2; round++) {
    const issues = lintAll(out, input.rules);
    const failing = Object.keys(issues) as PlatformId[];
    if (!failing.length) break;
    const fixUser = `${base}

These captions have problems. Fix each one so it reads naturally, follows every rule and stays faithful to the transcript. Change only what's needed.

${failing.map((p) => `[${p}]\n${out[p]!.text}\nProblems:\n${issues[p]!.map((i) => `- ${i}`).join("\n")}`).join("\n\n")}

Return JSON: {"captions":{"<platform id>":"fixed caption"}}, only for: ${failing.join(", ")}.`;
    collect(await groqJSON(chat(system, fixUser, 3500, "medium"), apiKey), out, failing);
  }
  for (const r of Object.values(out)) if (r) r.text = fixRepeatedName(r.text);
  return out;
}

/** Turns one caption edit into a reusable rule, or null if it was a one-off content fix. */
export async function learnRule(
  platform: PlatformId,
  before: string,
  after: string,
  rules: BrandRule[],
  apiKey: string
): Promise<{ text: string; scope: "all" | PlatformId } | null> {
  const system = `You infer a creator's lasting style preferences from how they edit captions. Respond with JSON only.`;
  const user = `Platform: ${platform}
Caption before the creator's edit:
"""${before.slice(0, 2000)}"""
After the creator's edit:
"""${after.slice(0, 2000)}"""

Rules already saved:
${rulesPrompt(rulesFor(rules, platform)) || "(none)"}

If the edit shows a reusable style preference, state it as one short imperative rule that would apply to future captions
(e.g. removed all emojis -> "Never use emojis."; swapped "guys" for "folks" -> "Say 'folks', not 'guys'."; cut hashtags to one -> "Use at most one hashtag.").
Scope: use "${platform}" when the preference is about a convention that differs between platforms (hashtags, length, line breaks, calls to action, formality). Use "all" for voice and wording preferences (word choice, naming, emojis, punctuation style).
If the edit only fixes facts, typos or wording specific to this clip, or the preference is already covered, return an empty rule.

Return JSON: {"rule":"... or empty string","scope":"all|${platform}"}`;

  const r = await groqJSON(chat(system, user, 1200), apiKey);
  const text = asString(r.rule);
  if (!text) return null;
  const suggested = r.scope === platform ? platform : "all";
  return { text, scope: scopeForLearnedRule(text, platform, suggested) };
}

/** Re-scores clips against the creator's performance history. Moves are capped at ±15 points. */
export async function rerankClips(clips: ClipRef[], learnings: Learning[], apiKey: string): Promise<RerankResult> {
  if (!learnings.length || !clips.length) return {};
  const system = `You are a social video strategist who predicts which clips will perform, using the creator's real results. Respond with JSON only.`;
  const user = `How this creator's past clips actually performed:
${learningsPrompt(learnings)}

Clips to score (id | current score | title | hook | why it was picked):
${clips.map((c) => `${c.id} | ${c.score ?? 70} | ${c.title} | ${c.hook} | ${c.why ?? ""}`).join("\n")}

For each clip, adjust the current score by at most 15 points based on how much it resembles past hits (raise) or flops (lower) in topic, angle and hook style.
If no learning is relevant, keep the current score and leave the reason empty. Only cite the results listed above; never invent past performance.

Return JSON: {"clips":[{"id":"...","score":<0-100>,"reason":"which learning moved it and why, max 14 words, or empty"}]}`;

  const r = await groqJSON(chat(system, user, 3000, "medium"), apiKey);
  const byId = new Map(clips.map((c) => [c.id, c]));
  const out: RerankResult = {};
  for (const item of asObjects(r.clips)) {
    const c = byId.get(asString(item.id));
    if (!c) continue;
    const base = c.score ?? 70;
    const score = Math.round(Math.max(base - 15, Math.min(base + 15, Number(item.score) || base)));
    out[c.id] = { score: Math.max(0, Math.min(100, score)), reason: score === base ? "" : asString(item.reason) };
  }
  return out;
}
