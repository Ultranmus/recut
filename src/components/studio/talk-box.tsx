"use client";

import { useEffect, useRef, useState } from "react";
import { transcribeVoiceNote } from "@/lib/pipeline";
import { getGroqKey } from "@/lib/settings";
import type { ParsedBrief } from "@/lib/studio-ai";
import { PLATFORMS, type Clip } from "@/lib/types";
import { IconCheck, IconSparkle } from "../icons";

export type BriefState = "idle" | "parsing" | "writing" | "done" | "error";

const MAX_CHARS = 4000;

const EXAMPLES = [
  "Okay so um, I want to, uh, post the bit about the Gateway space station. Put it on LinkedIn, no wait, actually make that X and Instagram. Keep it, like, curious and kind of playful, but you know, not cheesy. Oh and, um, from now on no emojis, ever. And always say NASA's Gateway, not just Gateway.",
  "Um, so post the Gateway clip on Tuesday, uh, on X at like 9am. And the political risk one, put that on Thursday, no wait, Friday. Oh and the Cold War clip we posted last week got, like, forty thousand views on Reels, and the humans versus robots one totally flopped. Anyway my coffee machine broke this morning, whatever.",
];

function MicIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  );
}

export function TalkToStudio({
  state,
  error,
  brief,
  clips,
  targetClip,
  summary,
  onSubmit,
  onClear,
}: {
  state: BriefState;
  error: string | null;
  brief: ParsedBrief | null;
  clips: Clip[];
  targetClip: Clip | null;
  summary: string[];
  onSubmit: (raw: string) => void;
  onClear: () => void;
}) {
  const [text, setText] = useState("");
  const [example, setExample] = useState(0);
  const titleOf = (id: string) => clips.find((c) => c.id === id)?.title;
  const [open, setOpen] = useState(true);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const busy = state === "parsing" || state === "writing";

  // "/" anywhere jumps to the brief box, so the creator can hold fn and talk straight away.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || el.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => area.current?.focus());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  function submit() {
    if (!text.trim() || busy) return;
    onSubmit(text.trim());
  }

  async function toggleMic() {
    setMicError(null);
    if (recording) {
      recorder.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setTranscribing(true);
        try {
          const said = await transcribeVoiceNote(new Blob(chunks, { type: rec.mimeType }), getGroqKey());
          setText((t) => (t ? `${t} ${said}` : said));
          area.current?.focus();
        } catch (err) {
          setMicError(err instanceof Error ? err.message : "Couldn't transcribe that.");
        } finally {
          setTranscribing(false);
        }
      };
      recorder.current = rec;
      rec.start();
      setSeconds(0);
      setRecording(true);
    } catch {
      setMicError("Microphone access was blocked.");
    }
  }

  return (
    <section
      className={`glass relative shrink-0 overflow-hidden rounded-2xl transition-shadow duration-500 ${
        busy || recording ? "shadow-[0_0_0_1px_rgba(10,132,255,0.45),0_20px_60px_-20px_rgba(10,132,255,0.5)]" : ""
      }`}
      aria-label="Talk to your studio"
    >
      <div aria-hidden className="pointer-events-none absolute -left-20 -top-24 size-64 rounded-full bg-accent/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-28 size-56 rounded-full bg-accent-3/12 blur-3xl" />

      <div className="relative flex items-center justify-between gap-3 px-4 pt-3.5">
        <div className="flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-[10px] bg-gradient-to-br from-[#2b95ff] via-[#5e5ce6] to-[#bf5af2] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_6px_18px_-6px_rgba(94,92,230,0.8)]">
            <MicIcon size={16} />
          </span>
          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
              Talk to your studio
              <kbd className="hidden rounded border border-hairline-strong bg-white/5 px-1.5 font-sans text-[10px] font-normal text-fg-3 sm:inline" title="Press / to focus">
                /
              </kbd>
            </h2>
            <p className="text-xs text-fg-3">
              Brief it like a video editor. Hold <kbd className="rounded border border-hairline-strong bg-white/5 px-1 font-sans text-[10px] text-fg-2">fn</kbd> to dictate
              with Wispr Flow; filler words and “no wait, actually…” are handled.
            </p>
          </div>
        </div>
        <button className="btn btn-ghost h-7 px-2 text-xs" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open ? (
        <div className="relative grid gap-4 p-4 pt-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          {/* Input */}
          <div className="flex flex-col">
            <div className="relative flex-1">
              <textarea
                ref={area}
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    submit();
                  }
                }}
                rows={4}
                placeholder="“Um, take the Gateway bit and make it for LinkedIn, no wait, X. Keep it curious. And from now on, no emojis…”"
                className="field scroll-thin h-full min-h-28 resize-none bg-black/30 py-3 text-[15px] leading-relaxed placeholder:text-fg-3"
                aria-label="Spoken brief"
              />
              {text.length > MAX_CHARS * 0.85 ? (
                <span className="absolute bottom-2 right-3 text-[10px] tabular-nums text-warning">
                  {text.length}/{MAX_CHARS}
                </span>
              ) : null}
              {recording ? (
                <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-danger/15 px-2.5 py-1 text-[11px] font-medium text-danger">
                  <span className="size-1.5 animate-pulse rounded-full bg-danger" /> Listening {seconds}s
                </span>
              ) : null}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button
                className={`btn h-8 px-3 text-xs ${recording ? "bg-danger text-white hover:bg-danger/90" : "btn-secondary"}`}
                onClick={toggleMic}
                disabled={transcribing || busy}
                title="No Wispr Flow? Record here and Groq Whisper transcribes it."
              >
                <MicIcon size={14} />
                {recording ? "Stop" : transcribing ? "Transcribing…" : "Record"}
              </button>
              <button
                className="btn btn-ghost h-8 px-2.5 text-xs"
                onClick={() => {
                  setText(EXAMPLES[example % EXAMPLES.length]);
                  setExample((n) => n + 1);
                }}
                disabled={busy}
                title="Cycles through example briefs: captions & rules, then calendar & feedback"
              >
                Try a messy example{example ? ` (${(example % EXAMPLES.length) + 1}/${EXAMPLES.length})` : ""}
              </button>
              {text || brief ? (
                <button
                  className="btn btn-ghost h-8 px-2.5 text-xs"
                  disabled={busy}
                  onClick={() => {
                    setText("");
                    onClear();
                    area.current?.focus();
                  }}
                >
                  Clear
                </button>
              ) : null}
              <span className="ml-auto hidden text-[11px] text-fg-3 sm:inline">⌘↵</span>
              <button className="btn btn-primary h-8 text-xs" onClick={submit} disabled={!text.trim() || busy}>
                <IconSparkle size={14} />
                {state === "parsing" ? "Understanding…" : state === "writing" ? "Writing captions…" : "Brief the editor"}
              </button>
            </div>
            {micError || error ? <p className="mt-2 text-xs text-danger">{micError ?? error}</p> : null}
          </div>

          {/* What it understood */}
          <div className="rounded-xl border border-hairline bg-black/20 p-3.5">
            <div className="mb-2.5 flex items-center justify-between">
              <h3 className="label">What I understood</h3>
              {state === "writing" ? <span className="text-[11px] text-accent">Working on it…</span> : null}
            </div>

            {state === "parsing" ? (
              <div className="space-y-2.5">
                {[70, 45, 55, 80].map((w, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="h-3 w-16 animate-pulse rounded bg-white/8" />
                    <div className="h-3 animate-pulse rounded bg-white/10" style={{ width: `${w}%` }} />
                  </div>
                ))}
              </div>
            ) : (
              <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
                <dt className="text-fg-3">Topic</dt>
                <dd className={brief?.topic ? "" : "text-fg-3"}>
                  {brief ? brief.topic || (brief.wantsCaptions ? "Current clip" : "—") : "—"}
                  {brief && targetClip ? <span className="ml-1.5 text-[11px] text-accent">→ {targetClip.title}</span> : null}
                </dd>

                <dt className="text-fg-3">Platform</dt>
                <dd className="flex flex-wrap gap-1">
                  {brief && (brief.platforms.length || brief.wantsCaptions) ? (
                    (brief.platforms.length ? PLATFORMS.filter((p) => brief.platforms.includes(p.id)) : PLATFORMS).map((p) => (
                      <span key={p.id} className="flex items-center gap-1 rounded-md bg-white/7 px-1.5 py-0.5 text-[11px]">
                        <span className="size-1.5 rounded-full" style={{ background: p.color }} />
                        {p.short}
                      </span>
                    ))
                  ) : (
                    <span className="text-fg-3">—</span>
                  )}
                </dd>

                <dt className="text-fg-3">Tone</dt>
                <dd className={brief?.tone ? "" : "text-fg-3"}>{brief ? brief.tone || (brief.wantsCaptions ? "Keep current tone" : "—") : "—"}</dd>

                <dt className="text-fg-3">Brand rules</dt>
                <dd className="space-y-1">
                  {brief?.rules.length ? (
                    brief.rules.map((r) => (
                      <p key={r} className="flex items-start gap-1.5">
                        <IconCheck size={13} className="mt-0.5 shrink-0 text-success" />
                        <span>
                          {r} <span className="text-[11px] text-fg-3">· saved to memory</span>
                        </span>
                      </p>
                    ))
                  ) : (
                    <span className="text-fg-3">{brief ? "None new" : "—"}</span>
                  )}
                </dd>

                {brief?.schedule.length ? (
                  <>
                    <dt className="text-fg-3">Schedule</dt>
                    <dd className="space-y-1 text-[12px]">
                      {brief.schedule.map((s, i) => (
                        <p key={i} className="flex items-start gap-1.5">
                          {s.clipId ? (
                            <IconCheck size={13} className="mt-0.5 shrink-0 text-success" />
                          ) : (
                            <span className="mt-px shrink-0 text-warning">!</span>
                          )}
                          <span>
                            <span className="font-medium">
                              {new Date(`${s.date}T12:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                              {s.time ? ` · ${s.time}` : ""}
                            </span>{" "}
                            {s.clipId ? (
                              <>
                                {titleOf(s.clipId)}
                                {s.platforms.length ? ` · ${PLATFORMS.filter((p) => s.platforms.includes(p.id)).map((p) => p.short).join(", ")}` : ""}
                                <span className="text-[11px] text-fg-3"> · on calendar</span>
                              </>
                            ) : (
                              <span className="text-warning">no clip in this episode matches “{s.clipQuery}”</span>
                            )}
                          </span>
                        </p>
                      ))}
                    </dd>
                  </>
                ) : null}

                {brief?.feedback.length ? (
                  <>
                    <dt className="text-fg-3">Feedback</dt>
                    <dd className="space-y-1 text-[12px]">
                      {brief.feedback.map((f, i) => (
                        <p key={i} className="flex items-start gap-1.5">
                          <span className={`shrink-0 font-semibold ${f.outcome === "hit" ? "text-success" : f.outcome === "flop" ? "text-danger" : "text-fg-2"}`}>
                            {f.outcome === "hit" ? "▲" : f.outcome === "flop" ? "▼" : "•"}
                          </span>
                          <span>
                            {f.clipId ? (
                              <>
                                <span className="font-medium">{titleOf(f.clipId)}</span>: {f.metric || f.outcome}
                                {f.platform ? ` on ${PLATFORMS.find((p) => p.id === f.platform)?.short}` : ""}
                                <span className="text-[11px] text-fg-3"> · saved as a learning</span>
                              </>
                            ) : (
                              <span className="text-warning">no clip in this episode matches “{f.clipQuery}”</span>
                            )}
                          </span>
                        </p>
                      ))}
                    </dd>
                  </>
                ) : null}

                {brief?.corrections.length ? (
                  <>
                    <dt className="text-fg-3">Corrected</dt>
                    <dd className="space-y-0.5 text-[12px]">
                      {brief.corrections.map((c, i) => (
                        <p key={i}>
                          <span className="text-fg-3 line-through decoration-danger/70">{c.from}</span>
                          <span className="mx-1.5 text-fg-3">→</span>
                          <span>{c.to}</span>
                        </p>
                      ))}
                    </dd>
                  </>
                ) : null}

                {brief?.digressions?.length ? (
                  <>
                    <dt className="text-fg-3">Set aside</dt>
                    <dd className="space-y-0.5 text-[12px] text-fg-3">
                      {brief.digressions.map((d) => (
                        <p key={d}>“{d}”</p>
                      ))}
                    </dd>
                  </>
                ) : null}

                {brief?.fillers.length ? (
                  <>
                    <dt className="text-fg-3">Ignored</dt>
                    <dd className="flex flex-wrap gap-1">
                      {brief.fillers.map((f) => (
                        <span key={f} className="rounded bg-white/5 px-1.5 py-px text-[11px] text-fg-3 line-through">
                          {f}
                        </span>
                      ))}
                    </dd>
                  </>
                ) : null}
              </dl>
            )}
            {state === "done" && summary.length ? (
              <p className="mt-3 border-t border-hairline pt-2.5 text-[11px] text-success">{summary.join(" · ")}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
