"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { getLearnings, getRules } from "@/lib/brand-memory";
import { saveProject } from "@/lib/projects";
import { analyzeTranscript, transcribeFile, type Progress, type Stage } from "@/lib/pipeline";
import { getGroqKey, useGroqKey } from "@/lib/settings";
import { useServerKey } from "@/lib/use-server-key";
import { IconCheck, IconUpload } from "./icons";

const MAX_BYTES = 1024 * 1024 * 1024;

const STEPS: { stage: Stage; label: string; sub: string }[] = [
  { stage: "decode", label: "Extract audio", sub: "In your browser" },
  { stage: "transcribe", label: "Transcribe", sub: "Groq Whisper, word timestamps" },
  { stage: "analyze", label: "Pick moments & write captions", sub: "5–8 moments · Reels, LinkedIn, X, Shorts" },
];
const ORDER: Stage[] = ["decode", "transcribe", "analyze", "done"];

export function UploadCard({ onNeedKey }: { onNeedKey: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const userKey = useGroqKey();
  const serverKey = useServerKey();
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasKey = Boolean(userKey || serverKey);

  async function start(f: File) {
    setError(null);
    if (!/^(audio|video)\//.test(f.type) && !/\.(mp3|m4a|wav|aac|ogg|flac|mp4|mov|webm|mkv)$/i.test(f.name)) {
      setError("That doesn't look like an audio or video file.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("Files up to 1 GB are supported.");
      return;
    }
    if (!getGroqKey() && !serverKey) {
      setError("Add a Groq API key in Settings to transcribe uploads.");
      onNeedKey();
      return;
    }
    setFile(f);
    try {
      const key = getGroqKey();
      const name = f.name.replace(/\.[^.]+$/, "");
      const transcript = await transcribeFile(f, key, setProgress);
      const { analysis, warning } = await analyzeTranscript(transcript, name, key, setProgress, getRules(), getLearnings());
      setProgress({ stage: "done", value: 1, detail: "Opening studio" });
      const id = crypto.randomUUID().slice(0, 8);
      await saveProject({
        id,
        name: analysis.title && analysis.title !== "Untitled episode" ? analysis.title : name,
        createdAt: Date.now(),
        kind: f.type.startsWith("video/") || /\.(mp4|mov|mkv)$/i.test(f.name) ? "video" : "audio",
        transcript,
        analysis,
        file: f,
        notice: warning,
      });
      router.push(`/studio/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setProgress(null);
      setFile(null);
    }
  }

  const busy = Boolean(file && progress);
  const current = progress ? ORDER.indexOf(progress.stage) : -1;

  if (busy && progress) {
    return (
      <div className="glass flex h-full flex-col rounded-3xl p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-accent/15 text-accent">
            <IconUpload size={19} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{file?.name}</p>
            <p className="text-xs text-fg-3">{((file?.size ?? 0) / 1024 / 1024).toFixed(1)} MB</p>
          </div>
        </div>
        <ol className="mt-7 space-y-5">
          {STEPS.map((s, i) => {
            const state = i < current ? "done" : i === current ? "active" : "todo";
            return (
              <li key={s.stage} className="flex gap-3.5">
                <span
                  className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold transition-colors ${
                    state === "done"
                      ? "bg-success text-black"
                      : state === "active"
                        ? "bg-accent text-white animate-[pulse-ring_1.4s_ease-out_infinite]"
                        : "bg-white/8 text-fg-3"
                  }`}
                >
                  {state === "done" ? <IconCheck size={13} strokeWidth={2.6} /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className={`text-sm font-medium ${state === "todo" ? "text-fg-3" : ""}`}>{s.label}</p>
                    {state === "active" && progress.detail ? (
                      <span className="text-xs text-fg-2 tabular-nums">{progress.detail}</span>
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
        <p className="mt-auto pt-6 text-xs text-fg-3">Keep this tab open. Longer episodes take a minute or two.</p>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
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

      {error ? <p className="mt-4 rounded-xl bg-danger/10 px-3.5 py-2.5 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
