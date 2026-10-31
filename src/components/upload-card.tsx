"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getLearnings, getRules } from "@/lib/brand-memory";
import { saveProject } from "@/lib/projects";
import { analyzeTranscript, transcribeFile, type Progress, type Stage } from "@/lib/pipeline";
import { getGroqKey, useGroqKey } from "@/lib/settings";
import { useServerKey } from "@/lib/use-server-key";
import { IconCheck, IconUpload } from "./icons";

const MAX_BYTES = 1024 * 1024 * 1024;

const STEPS: { stage: Stage; label: string; sub: string }[] = [
  { stage: "decode", label: "Extract audio", sub: "In your browser, nothing uploaded yet" },
  { stage: "transcribe", label: "Transcribe", sub: "Groq Whisper, timestamps on every word" },
  { stage: "analyze", label: "Pick moments & write captions", sub: "5–8 clips · Reels, LinkedIn, X, Shorts" },
];
const ORDER: Stage[] = ["decode", "transcribe", "analyze", "done"];
/** Share of the overall bar each stage covers, so one number tracks the whole job. */
const WEIGHT: Record<Stage, [number, number]> = { decode: [0, 0.1], transcribe: [0.1, 0.7], analyze: [0.7, 0.98], done: [1, 1] };

function overall(p: Progress) {
  const [a, b] = WEIGHT[p.stage];
  return a + (b - a) * Math.min(1, Math.max(0, p.value));
}

function clock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function friendly(err: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "You're offline. Reconnect and try again.";
  const msg = err instanceof Error ? err.message : "Something went wrong.";
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return "Couldn't reach the server. Check your connection and try again.";
  return msg;
}

export function UploadCard({ onNeedKey }: { onNeedKey: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const run = useRef(0);
  const userKey = useGroqKey();
  const serverKey = useServerKey();
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const hasKey = Boolean(userKey || serverKey);
  const busy = Boolean(file && progress);

  // Tick the elapsed clock, and warn before leaving mid-job (the work lives in this tab).
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => {
      clearInterval(t);
      window.removeEventListener("beforeunload", warn);
    };
  }, [busy]);

  function reset() {
    run.current++;
    setFile(null);
    setProgress(null);
  }

  async function start(f: File) {
    setError(null);
    if (!/^(audio|video)\//.test(f.type) && !/\.(mp3|m4a|wav|aac|ogg|flac|mp4|mov|webm|mkv)$/i.test(f.name)) {
      setError("That doesn't look like an audio or video file. Try MP3, M4A, WAV, MP4, MOV or WebM.");
      return;
    }
    if (f.size === 0) {
      setError("That file is empty.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`That file is ${(f.size / 1024 ** 3).toFixed(1)} GB. Files up to 1 GB are supported.`);
      return;
    }
    if (!navigator.onLine) {
      setError("You're offline. Reconnect and try again.");
      return;
    }
    if (!getGroqKey() && !serverKey) {
      setError("Add a Groq API key in Settings to transcribe uploads.");
      onNeedKey();
      return;
    }
    const id = ++run.current;
    // Progress from a cancelled run must not repaint the card.
    const report = (p: Progress) => id === run.current && setProgress(p);
    setFile(f);
    setStartedAt(Date.now());
    setNow(Date.now());
    setProgress({ stage: "decode", value: 0, detail: "Reading file" });
    try {
      const key = getGroqKey();
      const name = f.name.replace(/\.[^.]+$/, "");
      const transcript = await transcribeFile(f, key, report);
      if (id !== run.current) return;
      const { analysis, warning } = await analyzeTranscript(transcript, name, key, report, getRules(), getLearnings());
      if (id !== run.current) return;
      report({ stage: "done", value: 1, detail: "Opening studio" });
      const projectId = crypto.randomUUID().slice(0, 8);
      await saveProject({
        id: projectId,
        name: analysis.title && analysis.title !== "Untitled episode" ? analysis.title : name,
        createdAt: Date.now(),
        kind: f.type.startsWith("video/") || /\.(mp4|mov|mkv)$/i.test(f.name) ? "video" : "audio",
        transcript,
        analysis,
        file: f,
        notice: warning,
      });
      router.push(`/studio/${projectId}`);
    } catch (err) {
      if (id !== run.current) return;
      setError(friendly(err));
      reset();
    }
  }

  const current = progress ? ORDER.indexOf(progress.stage) : -1;

  if (busy && progress) {
    const pct = Math.round(overall(progress) * 100);
    return (
      <div className="glass relative flex h-full flex-col overflow-hidden rounded-3xl p-6" role="status" aria-live="polite">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <div className="relative grid size-16 shrink-0 place-items-center">
            <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
              <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="url(#ring)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 28}
                strokeDashoffset={2 * Math.PI * 28 * (1 - pct / 100)}
                className="transition-[stroke-dashoffset] duration-700 ease-[var(--ease-mac)]"
              />
              <defs>
                <linearGradient id="ring" x1="0" x2="1">
                  <stop offset="0" stopColor="#0a84ff" />
                  <stop offset="1" stopColor="#bf5af2" />
                </linearGradient>
              </defs>
            </svg>
            <span className="text-sm font-semibold tabular-nums">{pct}%</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">{file?.name}</p>
            <p className="text-xs text-fg-3 tabular-nums">
              {((file?.size ?? 0) / 1024 / 1024).toFixed(1)} MB · {clock(now - startedAt)} elapsed
            </p>
          </div>
          <div className="flex h-8 items-end gap-[3px]" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="w-1 rounded-full bg-gradient-to-t from-accent to-accent-3"
                style={{ height: "100%", animation: `eq 1s ${i * 0.12}s ease-in-out infinite alternate` }}
              />
            ))}
          </div>
        </div>

        <ol className="relative mt-7 space-y-5">
          {STEPS.map((s, i) => {
            const state = i < current ? "done" : i === current ? "active" : "todo";
            return (
              <li key={s.stage} className="flex gap-3.5">
                <span
                  className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold transition-colors duration-300 ${
                    state === "done"
                      ? "bg-success text-black"
                      : state === "active"
                        ? "animate-[pulse-ring_1.4s_ease-out_infinite] bg-accent text-white"
                        : "bg-white/8 text-fg-3"
                  }`}
                >
                  {state === "done" ? <IconCheck size={13} strokeWidth={2.6} /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className={`text-sm font-medium ${state === "todo" ? "text-fg-3" : ""}`}>{s.label}</p>
                    {state === "active" && progress.detail ? (
                      <span className="shrink-0 text-xs text-fg-2 tabular-nums">{progress.detail}</span>
                    ) : null}
                  </div>
                  <p className="text-xs text-fg-3">{s.sub}</p>
                  {state === "active" ? (
                    <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/8">
                      <div
                        className="shimmer h-full rounded-full transition-[width] duration-500"
                        style={{ width: `${Math.max(6, progress.value * 100)}%` }}
                      />
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="relative mt-auto flex items-center justify-between gap-3 pt-6">
          <p className="text-xs text-fg-3">Keep this tab open. A 1-hour episode takes about 2 minutes.</p>
          <button className="btn btn-ghost h-8 shrink-0 text-xs" onClick={reset}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload an audio or video file"
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files[0];
        if (f) start(f);
      }}
      className={`group glass relative flex h-full cursor-pointer flex-col rounded-3xl p-6 outline-none transition-all duration-300 ease-[var(--ease-mac)] focus-visible:ring-2 focus-visible:ring-accent/70 ${
        drag ? "scale-[1.01] border-accent/60 bg-accent/10" : "hover:-translate-y-0.5 hover:border-hairline-strong"
      }`}
    >
      <input
        ref={input}
        type="file"
        accept="audio/*,video/*,.mp3,.m4a,.wav,.mp4,.mov,.webm"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) start(f);
        }}
      />
      <div className="flex items-center justify-between">
        <span className="label">Option 2</span>
        <span className="rounded-full border border-hairline px-2.5 py-0.5 text-[11px] text-fg-2">
          {hasKey ? (userKey ? "Using your key" : "Using server key") : serverKey === null ? "…" : "Needs a Groq key"}
        </span>
      </div>

      <div
        className={`mt-5 flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center transition-colors duration-300 ${
          drag ? "border-accent bg-accent/5" : "border-white/15 group-hover:border-white/25"
        }`}
      >
        <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-b from-white/12 to-white/4 text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-transform duration-500 ease-[var(--ease-mac)] group-hover:-translate-y-1">
          <IconUpload size={24} />
        </span>
        <h3 className="mt-5 text-lg font-semibold tracking-tight">Upload your own episode</h3>
        <p className="mt-1.5 max-w-xs text-sm text-fg-2">
          Drop an audio or video file here, or <span className="text-accent">browse</span>.
        </p>
        <p className="mt-4 text-xs text-fg-3">MP3 · M4A · WAV · MP4 · MOV · WebM, up to 1 GB</p>
      </div>

      {error ? (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-xl bg-danger/10 px-3.5 py-2.5 text-xs text-danger" role="alert">
          <span>{error}</span>
          <button
            className="shrink-0 text-danger/80 hover:text-danger"
            onClick={(e) => {
              e.stopPropagation();
              setError(null);
            }}
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}
