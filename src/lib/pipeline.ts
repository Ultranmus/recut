import { SAMPLE_RATE, decodeToMono, splitIntoChunks, type AudioChunk } from "./audio";
import { GROQ_BASE, TRANSCRIBE_MODEL, fallbackAnalysis, groqError, runAnalysis } from "./analysis";
import type { BrandRule, Learning } from "./brand-rules";
import type { Analysis, Segment, Transcript, Word } from "./types";

export type Stage = "decode" | "transcribe" | "analyze" | "done";
export type Progress = { stage: Stage; value: number; detail?: string };

type GroqTranscription = {
  language?: string;
  segments?: { start: number; end: number; text: string }[];
  words?: { word: string; start: number; end: number }[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * With a user key the browser calls Groq directly (the key never touches our server).
 * Without one, the chunk goes through /api/transcribe, which uses the env key.
 */
async function transcribeChunk(
  chunk: Pick<AudioChunk, "blob">,
  userKey: string | null,
  filename = "chunk.wav"
): Promise<GroqTranscription & { text?: string }> {
  for (let attempt = 0; ; attempt++) {
    const form = new FormData();
    form.append("file", chunk.blob, filename);
    let res: Response;
    if (userKey) {
      form.append("model", TRANSCRIBE_MODEL);
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "word");
      form.append("timestamp_granularities[]", "segment");
      form.append("temperature", "0");
      res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${userKey}` },
        body: form,
      });
    } else {
      res = await fetch("/api/transcribe", { method: "POST", body: form });
    }
    if (res.status === 429 && attempt < 5) {
      const retry = Number(res.headers.get("retry-after"));
      await sleep((Number.isFinite(retry) && retry > 0 ? retry + 1 : 10) * 1000);
      continue;
    }
    if (!res.ok) {
      if (userKey) throw new Error(await groqError(res));
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Transcription failed (${res.status})`);
    }
    return res.json();
  }
}

export async function transcribeFile(
  file: Blob,
  userKey: string | null,
  onProgress: (p: Progress) => void
): Promise<Transcript> {
  onProgress({ stage: "decode", value: 0, detail: "Extracting audio" });
  const pcm = await decodeToMono(file);
  const chunks = splitIntoChunks(pcm);
  const duration = pcm.length / SAMPLE_RATE;

  onProgress({ stage: "transcribe", value: 0, detail: `0 of ${chunks.length} parts` });
  const results: GroqTranscription[] = new Array(chunks.length);
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const i = next++;
      results[i] = await transcribeChunk(chunks[i], userKey);
      done++;
      onProgress({ stage: "transcribe", value: done / chunks.length, detail: `${done} of ${chunks.length} parts` });
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, chunks.length) }, worker));

  const segments: Segment[] = [];
  const words: Word[] = [];
  const r2 = (n: number) => Math.round(n * 100) / 100;
  results.forEach((r, i) => {
    const off = chunks[i].offset;
    for (const s of r.segments ?? []) {
      const text = s.text.trim();
      if (text) segments.push({ id: segments.length, start: r2(s.start + off), end: r2(s.end + off), text });
    }
    for (const w of r.words ?? []) {
      const word = w.word.trim();
      if (word) words.push({ word, start: r2(w.start + off), end: r2(w.end + off) });
    }
  });
  if (!segments.length) throw new Error("No speech was detected in this file.");

  return {
    language: results[0]?.language ?? "en",
    duration: r2(duration),
    text: segments.map((s) => s.text).join(" "),
    segments,
    words,
  };
}

/** Transcribes a short voice note (the in-app mic fallback for Wispr Flow). */
export async function transcribeVoiceNote(blob: Blob, userKey: string | null) {
  const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
  const r = await transcribeChunk({ blob }, userKey, `voice.${ext}`);
  return (r.text ?? (r.segments ?? []).map((s) => s.text).join(" ")).trim();
}

export async function analyzeTranscript(
  transcript: Transcript,
  name: string,
  userKey: string | null,
  onProgress: (p: Progress) => void,
  rules: BrandRule[] = [],
  learnings: Learning[] = []
): Promise<{ analysis: Analysis; warning?: string }> {
  onProgress({ stage: "analyze", value: 0, detail: "Finding the best moments" });
  try {
    if (userKey) {
      const analysis = await runAnalysis(transcript, name, userKey, (d, t) =>
        onProgress({ stage: "analyze", value: d / t, detail: `Reading part ${Math.min(d + 1, t)} of ${t}` }),
        rules,
        learnings
      );
      return { analysis };
    }
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, name, rules, learnings }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Analysis failed");
    return { analysis: body as Analysis };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Analysis failed";
    return {
      analysis: fallbackAnalysis(transcript, name),
      warning: `AI clip finder was unavailable (${reason}). Showing quick picks from transcript signals instead.`,
    };
  }
}
