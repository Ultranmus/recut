"use client";

import { useEffect, useRef, useState } from "react";
import { transcribeVoiceNote } from "@/lib/pipeline";
import { getGroqKey } from "@/lib/settings";
import type { ParsedBrief } from "@/lib/studio-ai";
import { PLATFORMS, type Clip } from "@/lib/types";
import { IconCheck, IconClose, IconSparkle, IconTrash } from "../icons";
import { formatTime } from "./schedule-dialog";

export type BriefState = "idle" | "parsing" | "writing" | "done" | "error";
export type BriefTarget = "captions" | "calendar" | "brand";

const MAX_CHARS = 4000;
const SEND_BRIEF = "recut:send-brief";

const EXAMPLES = [
  {
    label: "Captions + brand rules",
    text: "Okay so um, I want to, uh, post the bit about the Gateway space station. Put it on LinkedIn, no wait, actually make that X and Instagram. Keep it, like, curious and kind of playful, but you know, not cheesy. Oh and, um, from now on no emojis, ever. And always say NASA's Gateway, not just Gateway.",
  },
  {
    label: "Calendar + results",
    text: "Um, so post the Gateway clip on Tuesday, uh, on X at like 9am. And the political risk one, put that on Thursday, no wait, Friday. Oh and the Cold War clip we posted last week got, like, forty thousand views on Reels, and the humans versus robots one totally flopped. Anyway my coffee machine broke this morning, whatever.",
  },
];

/** Sends a sentence to the studio chat from anywhere (e.g. "How did it do?" on the calendar). */
export function sendBrief(text: string) {
  window.dispatchEvent(new CustomEvent(SEND_BRIEF, { detail: text }));
}

type Result = { brief: ParsedBrief | null; clipId: string | null; clipTitle: string | null; summary: string[]; error: string | null };
type Turn = { id: number; raw: string; result?: Result };

function MicIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  );
}

function SendIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
    </svg>
  );
}

function StudioBadge({ size = 32 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-[#2b95ff] via-[#5e5ce6] to-[#bf5af2] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_6px_18px_-6px_rgba(94,92,230,0.8)]"
      style={{ width: size, height: size }}
    >
      <MicIcon size={Math.round(size / 2)} />
    </span>
  );
}

/**
 * "Talk to your studio" as a chat that floats over the studio, so the clips, preview and captions
 * keep their full height. Each brief is a message; the reply shows what the editor understood.
 */
export function TalkToStudio({
  state,
  error,
  brief,
  clips,
  targetClip,
  summary,
  step,
  onSubmit,
  onClear,
  onNavigate,
}: {
  state: BriefState;
  error: string | null;
  brief: ParsedBrief | null;
  clips: Clip[];
  targetClip: Clip | null;
  summary: string[];
  step: string;
  onSubmit: (raw: string) => void;
  onClear: () => void;
  onNavigate: (target: BriefTarget, clipId?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [seen, setSeen] = useState(0);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const busy = state === "parsing" || state === "writing";
  const settled = state === "done" || state === "error";
  // The newest turn renders the live brief; earlier ones keep the snapshot taken when the next was sent.
  const finished = settled ? turns.length : Math.max(0, turns.length - 1);
  const unread = !open && finished > seen;

  const live: Result = { brief, clipId: targetClip?.id ?? null, clipTitle: targetClip?.title ?? null, summary, error };

  function show(next: boolean) {
    setOpen(next);
    setSeen(finished);
    if (next) requestAnimationFrame(() => area.current?.focus());
  }

  function submit(raw = text) {
    const said = raw.trim();
    if (!said || busy) return;
    setTurns((ts) => [...ts.map((t, i) => (i === ts.length - 1 && !t.result ? { ...t, result: live } : t)), { id: Date.now(), raw: said }]);
    if (raw === text) setText("");
    setOpen(true);
    onSubmit(said);
  }

  // Keep the newest message in view as the reply streams in.
  useEffect(() => {
    const el = thread.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns.length, state, open]);

  // "/" anywhere opens the chat, so the creator can hold fn and talk straight away.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "Escape" && el.closest("[data-studio-chat]")) {
        setOpen(false);
        return;
      }
      if (e.key !== "/" || e.metaKey || e.ctrlKey || el.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => area.current?.focus());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Sentences sent from elsewhere in the studio arrive as chat messages too.
  useEffect(() => {
    const onSend = (e: Event) => submit(String((e as CustomEvent).detail ?? ""));
    window.addEventListener(SEND_BRIEF, onSend);
    return () => window.removeEventListener(SEND_BRIEF, onSend);
  });

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  // Grow the composer with what's dictated, up to a few lines.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [text, open]);

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

  function navigate(target: BriefTarget, clipId?: string) {
    onNavigate(target, clipId);
    // On phones the chat covers the studio, so step aside to show the result.
    if (window.matchMedia("(max-width: 1023px)").matches) show(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => show(true)}
        className={`window fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-40 flex bg-[rgba(24,24,28,0.94)] items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4 text-sm font-medium transition-transform hover:scale-[1.02] active:scale-[0.98] ${
          busy ? "shadow-[0_0_0_1px_rgba(10,132,255,0.5),0_12px_40px_-10px_rgba(10,132,255,0.6)]" : ""
        }`}
        aria-label="Open Talk to your studio"
      >
        <StudioBadge size={30} />
        <span className="max-w-[16rem] truncate">{busy ? step || "Working…" : "Talk to your studio"}</span>
        <kbd className="hidden rounded border border-hairline-strong bg-white/5 px-1.5 font-sans text-[10px] font-normal text-fg-3 sm:inline">/</kbd>
        {unread ? <span className="absolute right-1 top-1 size-2.5 rounded-full bg-accent ring-2 ring-bg" aria-label="New reply" /> : null}
      </button>
    );
  }

  return (
    <section
      data-studio-chat
      aria-label="Talk to your studio"
      className={`window rise fixed inset-x-2 bottom-2 z-40 flex bg-[#141418] backdrop-filter-none [-webkit-backdrop-filter:none] h-[min(86dvh,44rem)] flex-col overflow-hidden rounded-2xl sm:inset-x-auto sm:bottom-4 sm:left-4 sm:h-[min(calc(100dvh-6rem),42rem)] sm:w-[25rem] ${
        busy || recording ? "shadow-[0_0_0_1px_rgba(10,132,255,0.45),0_30px_80px_-20px_rgba(10,132,255,0.45)]" : ""
      }`}
    >
      <header className="flex items-center gap-3 border-b border-hairline px-4 py-3">
        <StudioBadge size={32} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold tracking-tight">Talk to your studio</h2>
          <p className="truncate text-[11px] text-fg-3">
            Hold <kbd className="rounded border border-hairline-strong bg-white/5 px-1 font-sans text-[10px] text-fg-2">fn</kbd> to dictate with Wispr Flow
          </p>
        </div>
        {turns.length ? (
          <button
            className="btn btn-ghost h-8 w-8 p-0"
            disabled={busy}
            onClick={() => {
              setTurns([]);
              setSeen(0);
              onClear();
              area.current?.focus();
            }}
            aria-label="Clear conversation"
            title="Clear conversation"
          >
            <IconTrash size={15} />
          </button>
        ) : null}
        <button className="btn btn-ghost h-8 w-8 p-0" onClick={() => show(false)} aria-label="Minimize chat" title="Minimize (Esc)">
          <IconClose size={16} />
        </button>
      </header>

      <div ref={thread} className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
        {turns.length === 0 ? (
          <div className="flex h-full flex-col justify-end gap-4 pb-1">
            <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-hairline bg-white/[0.04] px-3.5 py-3 text-[13px] leading-relaxed text-fg-2">
              <p className="font-medium text-fg">Brief me like you&apos;d brief a video editor.</p>
              <p className="mt-1.5">
                Say which clip, which platforms and the tone. Add lasting rules (&ldquo;never use emojis&rdquo;), schedule posts (&ldquo;Gateway clip on
                Tuesday&rdquo;) or tell me how a clip did. Filler words, &ldquo;no wait, actually…&rdquo; and tangents are handled.
              </p>
            </div>
            <div>
              <p className="label mb-2">Try a messy example</p>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex.label}
                    onClick={() => {
                      setText(ex.text);
                      area.current?.focus();
                    }}
                    className="rounded-full border border-hairline-strong bg-white/[0.04] px-3 py-1.5 text-xs text-fg-2 transition-colors hover:border-accent/50 hover:text-fg"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          turns.map((t, i) => {
            const isLive = i === turns.length - 1 && !t.result;
            return (
              <div key={t.id} className="space-y-2.5">
                <div className="ml-auto w-fit max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-3.5 py-2.5 text-[13px] leading-relaxed text-white shadow-[0_6px_20px_-8px_rgba(10,132,255,0.7)]">
                  {t.raw}
                </div>
                <Reply result={isLive ? live : t.result!} state={isLive ? state : "done"} step={step} clips={clips} onNavigate={navigate} />
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-hairline p-3">
        {micError ? <p className="mb-2 px-1 text-xs text-danger">{micError}</p> : null}
        <div className="flex items-end gap-2 rounded-xl border border-hairline-strong bg-black/30 p-1.5 transition-colors focus-within:border-accent/60">
          <button
            className={`grid size-9 shrink-0 place-items-center rounded-lg transition-colors ${
              recording ? "bg-danger text-white" : "text-fg-2 hover:bg-white/8 hover:text-fg"
            }`}
            onClick={toggleMic}
            disabled={transcribing || busy}
            aria-label={recording ? "Stop recording" : "Record a voice brief"}
            title="No Wispr Flow? Record here and Groq Whisper transcribes it."
          >
            {transcribing ? <span className="size-3.5 animate-spin rounded-full border-2 border-fg-3 border-t-transparent" /> : <MicIcon size={17} />}
          </button>
          <textarea
            ref={area}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={recording ? `Listening… ${seconds}s, tap the mic to stop` : "Brief your editor…"}
            className="scroll-thin max-h-42 min-h-9 flex-1 resize-none bg-transparent py-2 text-[14px] leading-snug outline-none placeholder:text-fg-3"
            aria-label="Spoken brief"
          />
          <button
            className="btn btn-primary size-9 shrink-0 rounded-lg p-0"
            onClick={() => submit()}
            disabled={!text.trim() || busy}
            aria-label="Send brief"
          >
            {busy ? <span className="size-3.5 animate-spin rounded-full border-2 border-white/60 border-t-transparent" /> : <SendIcon size={17} />}
          </button>
        </div>
        <p className="mt-1.5 flex justify-between px-1 text-[10px] text-fg-3">
          <span>Enter to send · Shift+Enter for a new line</span>
          {text.length > MAX_CHARS * 0.85 ? <span className="tabular-nums text-warning">{text.length}/{MAX_CHARS}</span> : null}
        </p>
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="pt-px text-fg-3">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

/** The editor's reply: only what it actually understood, then what it did and where to look. */
function Reply({
  result,
  state,
  step,
  clips,
  onNavigate,
}: {
  result: Result;
  state: BriefState;
  step: string;
  clips: Clip[];
  onNavigate: (target: BriefTarget, clipId?: string) => void;
}) {
  const { brief, clipId, clipTitle, summary, error } = result;
  const titleOf = (id: string) => clips.find((c) => c.id === id)?.title;
  const bubble = "w-fit max-w-[92%] rounded-2xl rounded-bl-md border border-hairline bg-white/[0.04] px-3.5 py-3 text-[13px]";

  if (state === "parsing") {
    return (
      <div className={`${bubble} flex items-center gap-2 text-fg-2`}>
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-1.5 animate-bounce rounded-full bg-fg-3" style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </span>
        {step || "Understanding your brief…"}
      </div>
    );
  }
  if (!brief) {
    return error ? <div className={`${bubble} border-danger/30 bg-danger/10 text-danger`}>{error}</div> : null;
  }

  const platforms = brief.platforms.length ? PLATFORMS.filter((p) => brief.platforms.includes(p.id)) : brief.wantsCaptions ? PLATFORMS : [];
  const writesCaptions = summary.some((s) => /caption/.test(s) && !/already match/.test(s));
  const scheduled = summary.some((s) => /calendar/.test(s));
  const learned = summary.some((s) => /rule|learning/.test(s));

  return (
    <div className={`${bubble} w-full`}>
      <p className="label mb-2.5 flex items-center gap-1.5 text-accent">
        <IconSparkle size={12} /> What I understood
      </p>
      <dl className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-x-3 gap-y-2 leading-snug">
        {clipTitle ? (
          <Row label="Clip">
            <button className="text-left font-medium text-accent hover:underline" onClick={() => onNavigate("captions", clipId ?? undefined)}>
              {clipTitle}
            </button>
          </Row>
        ) : null}
        {brief.topic ? <Row label="Topic">{brief.topic}</Row> : null}
        {platforms.length ? (
          <Row label="Platforms">
            <span className="flex flex-wrap gap-1">
              {platforms.map((p) => (
                <span key={p.id} className="flex items-center gap-1 rounded-md bg-white/7 px-1.5 py-0.5 text-[11px]">
                  <span className="size-1.5 rounded-full" style={{ background: p.color }} />
                  {p.short}
                </span>
              ))}
            </span>
          </Row>
        ) : null}
        {brief.tone ? <Row label="Tone">{brief.tone}</Row> : null}
        {brief.rules.length ? (
          <Row label="New rules">
            <span className="block space-y-1">
              {brief.rules.map((r) => (
                <span key={r} className="flex items-start gap-1.5">
                  <IconCheck size={13} className="mt-0.5 shrink-0 text-success" />
                  {r}
                </span>
              ))}
            </span>
          </Row>
        ) : null}
        {brief.schedule.length ? (
          <Row label="Schedule">
            <span className="block space-y-1 text-[12px]">
              {brief.schedule.map((s, i) => (
                <span key={i} className="flex items-start gap-1.5">
                  {s.clipId ? <IconCheck size={13} className="mt-0.5 shrink-0 text-success" /> : <span className="shrink-0 text-warning">!</span>}
                  <span>
                    <span className="font-medium">
                      {new Date(`${s.date}T12:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                      {s.time ? ` · ${formatTime(s.time)}` : ""}
                    </span>{" "}
                    {s.clipId ? (
                      <>
                        {titleOf(s.clipId)}
                        {s.platforms.length ? ` · ${PLATFORMS.filter((p) => s.platforms.includes(p.id)).map((p) => p.short).join(", ")}` : ""}
                      </>
                    ) : (
                      <span className="text-warning">no clip in this episode matches “{s.clipQuery}”</span>
                    )}
                  </span>
                </span>
              ))}
            </span>
          </Row>
        ) : null}
        {brief.feedback.length ? (
          <Row label="Results">
            <span className="block space-y-1 text-[12px]">
              {brief.feedback.map((f, i) => (
                <span key={i} className="flex items-start gap-1.5">
                  <span className={`shrink-0 font-semibold ${f.outcome === "hit" ? "text-success" : f.outcome === "flop" ? "text-danger" : "text-fg-2"}`}>
                    {f.outcome === "hit" ? "▲" : f.outcome === "flop" ? "▼" : "•"}
                  </span>
                  <span>
                    {f.clipId ? (
                      <>
                        <span className="font-medium">{titleOf(f.clipId)}</span>: {f.metric || f.outcome}
                        {f.platform ? ` on ${PLATFORMS.find((p) => p.id === f.platform)?.short}` : ""}
                      </>
                    ) : (
                      <span className="text-warning">no clip in this episode matches “{f.clipQuery}”</span>
                    )}
                  </span>
                </span>
              ))}
            </span>
          </Row>
        ) : null}
        {brief.corrections.length ? (
          <Row label="Corrected">
            <span className="block space-y-0.5 text-[12px]">
              {brief.corrections.map((c, i) => (
                <span key={i} className="block">
                  <span className="text-fg-3 line-through decoration-danger/70">{c.from}</span>
                  <span className="mx-1.5 text-fg-3">→</span>
                  {c.to}
                </span>
              ))}
            </span>
          </Row>
        ) : null}
        {brief.digressions?.length ? (
          <Row label="Set aside">
            <span className="block space-y-0.5 text-[12px] text-fg-3">
              {brief.digressions.map((d) => (
                <span key={d} className="block">
                  “{d}”
                </span>
              ))}
            </span>
          </Row>
        ) : null}
        {brief.fillers.length ? (
          <Row label="Ignored">
            <span className="flex flex-wrap gap-1">
              {brief.fillers.map((f) => (
                <span key={f} className="rounded bg-white/5 px-1.5 py-px text-[11px] text-fg-3 line-through">
                  {f}
                </span>
              ))}
            </span>
          </Row>
        ) : null}
      </dl>

      <div className="mt-3 border-t border-hairline pt-2.5">
        {state === "writing" ? (
          <p className="flex items-center gap-2 text-[12px] text-accent">
            <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-accent" /> {step || "Working on it…"}
          </p>
        ) : error ? (
          <p className="text-[12px] text-danger">{error}</p>
        ) : (
          <>
            <p className="text-[12px] text-success">{summary.join(" · ")}</p>
            {writesCaptions || scheduled || learned ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {writesCaptions ? (
                  <button className="btn btn-primary h-7 px-3 text-[11px]" onClick={() => onNavigate("captions", clipId ?? undefined)}>
                    Review captions
                  </button>
                ) : null}
                {scheduled ? (
                  <button className="btn btn-secondary h-7 px-3 text-[11px]" onClick={() => onNavigate("calendar")}>
                    Open calendar
                  </button>
                ) : null}
                {learned ? (
                  <button className="btn btn-secondary h-7 px-3 text-[11px]" onClick={() => onNavigate("brand")}>
                    Brand memory
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
