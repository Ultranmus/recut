"use client";

import { useEffect, useRef, useState } from "react";
import { duration, timecode } from "@/lib/format";
import { diffWords, groupDiff, keptShare } from "@/lib/diff";
import { PLATFORMS, type Clip, type PlatformId, type Segment, type Word } from "@/lib/types";
import { IconCheck, IconCopy, IconScissors, IconSparkle } from "../icons";

export function ScoreRing({ score, size = 34 }: { score: number; size?: number }) {
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 85 ? "var(--success)" : score >= 70 ? "var(--accent)" : "var(--warning)";
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} title={`Virality score ${score}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.1)" strokeWidth={3} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
        />
      </svg>
      <span className="absolute text-[11px] font-semibold tabular-nums">{score}</span>
    </span>
  );
}

export type ClipBadges = Record<string, { learning?: { text: string; cls: string }; scheduled?: string }>;

export function ClipList({
  clips,
  selectedId,
  onSelect,
  badges = {},
}: {
  clips: Clip[];
  selectedId: string;
  onSelect: (id: string) => void;
  badges?: ClipBadges;
}) {
  return (
    <ul className="space-y-1.5">
      {clips.map((c, i) => {
        const active = c.id === selectedId;
        return (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c.id)}
              className={`group flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all duration-200 ease-[var(--ease-mac)] ${
                active
                  ? "border-accent/50 bg-accent/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  : "border-transparent hover:bg-hover"
              }`}
            >
              {c.score ? (
                <ScoreRing score={c.score} />
              ) : (
                <span className="grid size-[34px] shrink-0 place-items-center rounded-full border border-dashed border-white/20 text-fg-3" title="Custom clip">
                  <IconScissors size={14} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-medium">{c.title}</span>
                  <span className="shrink-0 text-[10px] font-semibold text-fg-3">#{i + 1}</span>
                </span>
                <span className="mt-0.5 block font-mono text-[11px] text-fg-3 tabular-nums">
                  {timecode(c.start)} – {timecode(c.end)} · {duration(c.end - c.start)}
                </span>
                <span className={`mt-1.5 line-clamp-2 text-xs ${active ? "text-fg-2" : "text-fg-3"}`}>“{c.hook}”</span>
                <RankMeta clip={c} badges={badges[c.id]} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function RankMeta({ clip, badges }: { clip: Clip; badges?: ClipBadges[string] }) {
  const delta = clip.baseScore !== undefined ? clip.score - clip.baseScore : 0;
  if (!delta && !badges?.learning && !badges?.scheduled) return null;
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px]">
      {delta ? (
        <span
          className={`rounded px-1.5 py-px font-semibold ${delta > 0 ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}
          title={clip.rankNote}
        >
          {delta > 0 ? "↑" : "↓"} {Math.abs(delta)} from learnings
        </span>
      ) : null}
      {badges?.learning ? <span className={`rounded px-1.5 py-px font-semibold ${badges.learning.cls}`}>{badges.learning.text}</span> : null}
      {badges?.scheduled ? <span className="rounded bg-accent/15 px-1.5 py-px font-medium text-accent">{badges.scheduled}</span> : null}
    </span>
  );
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  return {
    copied,
    copy: async (key: string, text: string) => {
      if (!text.trim()) return;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = Object.assign(document.createElement("textarea"), { value: text });
        document.body.append(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        if (!ok) return setCopied(`${key}:failed`);
      }
      setCopied(key);
    },
  };
}

function AutoTextarea({
  value,
  onChange,
  onCommit,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: (before: string, after: string) => void;
  label: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const atFocus = useRef(value);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={2}
      className="field block min-h-16 resize-none overflow-hidden border-transparent bg-black/25 py-2.5 leading-relaxed"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => (atFocus.current = value)}
      onBlur={() => atFocus.current !== value && onCommit(atFocus.current, value)}
      aria-label={label}
    />
  );
}

export type PendingChange = { before: string; after: string; reason: string; source: "brief" | "rule" };

/**
 * A suggested rewrite, shown in place of the caption until the creator decides. "Changes" marks
 * removed words in red and added words in green in one passage; the other views show each version clean.
 */
function Suggestion({ change, onAccept, onReject }: { change: PendingChange; onAccept: () => void; onReject: () => void }) {
  const raw = diffWords(change.before, change.after);
  const parts = groupDiff(raw);
  // A caption that was mostly rewritten reads better clean than as a sea of red and green.
  const rewritten = keptShare(raw) < 0.4;
  const [view, setView] = useState<"changes" | "suggested" | "current">(rewritten ? "suggested" : "changes");
  return (
    <div data-suggestion className="rise overflow-hidden rounded-xl border border-accent/40 bg-accent/[0.05] shadow-[0_10px_30px_-14px_rgba(10,132,255,0.55)]">
      <div className="space-y-1 px-3 pb-2.5 pt-3">
        <p className="flex items-center gap-2 text-[12px] font-semibold text-accent">
          <IconSparkle size={13} className="shrink-0" />
          Suggested rewrite
          <span className="rounded-full bg-accent/15 px-2 py-px text-[10px] font-medium">
            {change.source === "brief" ? "From your brief" : "Brand rule"}
          </span>
        </p>
        {change.reason ? <p className="text-[12px] leading-relaxed text-fg-2">{change.reason}</p> : null}
        {rewritten ? <p className="text-[11px] text-fg-3">Mostly rewritten, so it opens on the new version. Compare with Current.</p> : null}
      </div>

      <div className="px-3">
        <div className="segmented w-full" role="tablist" aria-label="Suggestion view">
          {(
            [
              ["changes", "Changes"],
              ["suggested", "Suggested"],
              ["current", "Current"],
            ] as const
          ).map(([v, label]) => (
            <button key={v} role="tab" aria-selected={view === v} data-active={view === v} onClick={() => setView(v)} className="flex-1">
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="m-3 rounded-lg bg-black/30 px-3 py-2.5 text-[13px] leading-relaxed">
        <p className="whitespace-pre-wrap">
          {view === "changes"
            ? parts.map((d, i) => (
                <span
                  key={i}
                  className={
                    d.type === "added"
                      ? "rounded-sm bg-success/20 text-success"
                      : d.type === "removed"
                        ? "rounded-sm bg-danger/15 text-danger/90 line-through decoration-danger/70"
                        : "text-fg-2"
                  }
                >
                  {d.text}
                </span>
              ))
            : view === "suggested"
              ? change.after
              : <span className="text-fg-2">{change.before}</span>}
        </p>
        {view === "changes" ? (
          <p className="mt-2.5 flex gap-3 border-t border-hairline pt-2 text-[10px] text-fg-3">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-danger/60" /> Removed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-success/70" /> Added
            </span>
          </p>
        ) : null}
      </div>

      <div className="flex gap-2 border-t border-accent/20 bg-black/10 px-3 py-2.5">
        <button className="btn btn-secondary h-8 flex-1 text-xs" onClick={onReject}>
          Keep current
        </button>
        <button className="btn btn-primary h-8 flex-1 text-xs" onClick={onAccept}>
          <IconCheck size={13} /> Use suggestion
        </button>
      </div>
    </div>
  );
}

export function CaptionPanel({
  clip,
  onChange,
  pending,
  learning,
  onAccept,
  onReject,
  onAcceptAll,
  onCommitEdit,
}: {
  clip: Clip;
  onChange: (c: Clip) => void;
  pending: Partial<Record<PlatformId, PendingChange>>;
  learning: PlatformId | null;
  onAccept: (p: PlatformId) => void;
  onReject: (p: PlatformId) => void;
  onAcceptAll: () => void;
  onCommitEdit: (p: PlatformId, before: string, after: string) => void;
}) {
  const { copied, copy } = useCopy();
  const pendingCount = Object.keys(pending).length;
  const all = PLATFORMS.map((p) => `${p.name}\n${clip.captions[p.id] ?? ""}`).join("\n\n");

  return (
    <div className="space-y-3">
      {pendingCount ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2.5">
          <span className="text-xs leading-snug">
            <span className="font-semibold text-fg">
              {pendingCount} suggested rewrite{pendingCount === 1 ? "" : "s"}
            </span>
            <span className="block text-fg-2">Review each one below, or accept them all.</span>
          </span>
          <button className="btn btn-primary h-7 px-2.5 text-[11px]" onClick={onAcceptAll}>
            Accept all
          </button>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <h3 className="label">Captions · click to edit</h3>
        <button className="text-[11px] text-accent hover:underline" onClick={() => copy("all", all)}>
          {copied === "all" ? "Copied all 4 ✓" : "Copy all"}
        </button>
      </div>

      {PLATFORMS.map((p) => {
        const text = clip.captions[p.id] ?? "";
        const over = text.length > p.limit;
        const folded = p.visible < p.limit && text.length > p.visible;
        return (
          <section key={p.id} className="rounded-xl border border-hairline bg-white/[0.025] p-3 transition-colors focus-within:border-accent/40 focus-within:bg-white/[0.04]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="size-2 shrink-0 rounded-full" style={{ background: p.color }} />
                <span className="text-[13px] font-medium">{p.name}</span>
              </div>
              <button
                className="btn btn-ghost h-7 shrink-0 gap-1.5 px-2 text-[11px]"
                onClick={() => copy(p.id, text)}
                aria-label={`Copy ${p.name} caption`}
              >
                {copied === p.id ? <IconCheck size={13} className="text-success" /> : <IconCopy size={13} />}
                {copied === p.id ? "Copied" : copied === `${p.id}:failed` ? "Copy blocked" : "Copy"}
              </button>
            </div>
            {pending[p.id] ? (
              <Suggestion change={pending[p.id]!} onAccept={() => onAccept(p.id)} onReject={() => onReject(p.id)} />
            ) : (
              <AutoTextarea
                value={text}
                label={`${p.name} caption`}
                onChange={(v) => onChange({ ...clip, captions: { ...clip.captions, [p.id]: v } })}
                onCommit={(before, after) => onCommitEdit(p.id, before, after)}
              />
            )}
            {learning === p.id ? (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-accent-3">
                <span className="size-1.5 animate-pulse rounded-full bg-accent-3" /> Learning from your edit…
              </p>
            ) : null}
            <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px]">
              <span className="truncate text-fg-3">{p.tone}</span>
              <span
                className={`shrink-0 font-mono tabular-nums ${over ? "text-danger" : "text-fg-3"}`}
                title={folded ? `Feeds show about the first ${p.visible} characters before truncating` : undefined}
              >
                {folded ? <span className="mr-1.5 text-warning/80">fold @{p.visible}</span> : null}
                {text.length}/{p.limit}
              </span>
            </div>
          </section>
        );
      })}

      {clip.hashtags.length ? (
        <section className="pt-1">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="label">Hashtags</h3>
            <button
              className="text-[11px] text-accent hover:underline"
              onClick={() => copy("tags", clip.hashtags.map((h) => `#${h}`).join(" "))}
            >
              {copied === "tags" ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {clip.hashtags.map((h) => (
              <span key={h} className="rounded-md bg-white/6 px-2 py-0.5 text-xs text-fg-2">
                #{h}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** Start/end, editable hook line and the AI's reason for picking this moment. */
export function ClipDetails({
  clip,
  rank,
  scheduled,
  onChange,
  onSchedule,
}: {
  clip: Clip;
  rank: number;
  scheduled?: string;
  onChange: (c: Clip) => void;
  onSchedule: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-[560px] rounded-2xl border border-hairline bg-white/[0.03] p-4">
      <div className="flex items-start gap-3">
        {clip.score ? (
          <ScoreRing score={clip.score} size={40} />
        ) : (
          <span className="grid size-10 shrink-0 place-items-center rounded-full border border-dashed border-white/20 text-fg-3">
            <IconScissors size={15} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="truncate text-base font-semibold tracking-tight">
              {rank > 0 ? <span className="mr-1.5 text-fg-3">#{rank}</span> : null}
              {clip.title}
            </h2>
            <span className="flex items-center gap-1.5 rounded-md bg-white/6 px-2 py-0.5 font-mono text-[11px] tabular-nums text-fg-2">
              {timecode(clip.start)} <span className="text-fg-3">→</span> {timecode(clip.end)}
              <span className="text-fg-3">· {duration(clip.end - clip.start)}</span>
            </span>
          </div>
          <label className="mt-3 block">
            <span className="label">Hook</span>
            <input
              className="mt-1 w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 -mx-1 text-[17px] font-semibold leading-snug tracking-tight text-fg outline-none transition-colors hover:border-hairline focus:border-accent/60 focus:bg-black/25"
              value={clip.hook}
              maxLength={90}
              onChange={(e) => onChange({ ...clip, hook: e.target.value })}
            />
          </label>
          {clip.rankNote && clip.baseScore !== undefined && clip.score !== clip.baseScore ? (
            <p className={`mt-3 text-xs ${clip.score > clip.baseScore ? "text-success" : "text-danger"}`}>
              {clip.score > clip.baseScore ? "↑" : "↓"} Score {clip.baseScore} → {clip.score} from your results: {clip.rankNote}
            </p>
          ) : null}
          {clip.why ? (
            <div className="mt-3 flex gap-2 text-xs leading-relaxed text-fg-2">
              <IconSparkle size={14} className="mt-0.5 shrink-0 text-accent" />
              <p>
                <span className="font-medium text-fg">Why it was picked: </span>
                {clip.why}
              </p>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
            <button className="btn btn-secondary h-8 gap-1.5 px-3 text-xs" onClick={onSchedule}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
                <path d="M3.5 10h17M8 3v4M16 3v4M12 13.5v4M10 15.5h4" />
              </svg>
              Schedule post
            </button>
            {scheduled ? <span className="text-[11px] text-fg-3">On the calendar: {scheduled}</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Whole-episode strip showing where every clip sits; click a range to select it. */
export function EpisodeTimeline({
  total,
  clips,
  selectedId,
  time,
  onSelect,
}: {
  total: number;
  clips: Clip[];
  selectedId: string;
  time: number;
  onSelect: (id: string) => void;
}) {
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="label">Full episode</span>
        <span className="text-[11px] text-fg-3">{clips.length} clips · click one to preview</span>
      </div>
      <div className="relative h-10 rounded-xl bg-white/[0.04] ring-1 ring-inset ring-white/[0.06]">
        {ticks.slice(1, -1).map((f) => (
          <span key={f} aria-hidden className="absolute inset-y-2 w-px bg-white/[0.06]" style={{ left: `${f * 100}%` }} />
        ))}
        {clips.map((c, i) => {
          const active = c.id === selectedId;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              title={`#${i + 1} ${c.title} · ${timecode(c.start)}–${timecode(c.end)}`}
              aria-label={`Clip ${i + 1}: ${c.title}, ${timecode(c.start)} to ${timecode(c.end)}`}
              aria-current={active || undefined}
              className={`absolute inset-y-1.5 grid place-items-center rounded-md text-[10px] font-semibold tabular-nums transition-all duration-200 ${
                active
                  ? "z-10 bg-accent text-white shadow-[0_0_14px_rgba(10,132,255,0.65)] ring-1 ring-white/40"
                  : "bg-white/[0.14] text-fg-2 hover:bg-white/25 hover:text-fg"
              }`}
              style={{ left: `${(c.start / total) * 100}%`, width: `max(16px, ${((c.end - c.start) / total) * 100}%)` }}
            >
              {i + 1}
            </button>
          );
        })}
        <span
          className="pointer-events-none absolute -inset-y-0.5 z-20 w-0.5 rounded-full bg-white shadow-[0_0_8px_white]"
          style={{ left: `${Math.min(100, (time / total) * 100)}%` }}
        />
      </div>
      <div className="relative mt-1.5 h-3.5 font-mono text-[10px] tabular-nums text-fg-3">
        {ticks.map((f) => (
          <span
            key={f}
            className="absolute"
            style={f === 1 ? { right: 0 } : { left: `${f * 100}%`, transform: f === 0 ? undefined : "translateX(-50%)" }}
          >
            {timecode(f * total)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function TranscriptPanel({
  clip,
  words,
  segments,
  time,
  onSeek,
  onSelectSegment,
}: {
  clip: Clip;
  words: Word[];
  segments: Segment[];
  time: number;
  onSeek: (t: number) => void;
  onSelectSegment: (s: Segment) => void;
}) {
  const markerRef = useRef<HTMLDivElement>(null);
  const opened = useRef(false);
  const firstInClip = segments.findIndex((s) => s.end > clip.start);

  useEffect(() => {
    // Put the clip's first line at the top of the inspector, so the clip fills the view. Opening the
    // tab jumps there instantly; switching clips while it's open glides. Only the column scrolls.
    const el = markerRef.current;
    const box = el?.closest<HTMLElement>("[data-scroll]");
    if (!el || !box) return;
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 12;
    box.scrollTo({ top, behavior: opened.current ? "smooth" : "instant" });
    opened.current = true;
  }, [clip.id]);

  return (
    <div>
      <p className="mb-3 text-[11px] text-fg-3">Click a time to jump there or start a custom clip. Click a word in the clip to play from it.</p>
      <div>
        {segments.map((s, i) => {
          const inClip = s.start < clip.end && s.end > clip.start;
          const prevIn = i > 0 && segments[i - 1].start < clip.end && segments[i - 1].end > clip.start;
          const nextIn = i < segments.length - 1 && segments[i + 1].start < clip.end && segments[i + 1].end > clip.start;
          return (
            <div key={s.id}>
              {i === firstInClip ? (
                <div ref={markerRef} className="mb-1 mt-2 flex items-center gap-2 px-2">
                  <span className="label text-accent">This clip</span>
                  <span className="font-mono text-[11px] text-fg-3 tabular-nums">
                    {timecode(clip.start)} → {timecode(clip.end)}
                  </span>
                  <span className="h-px flex-1 bg-accent/25" />
                </div>
              ) : null}
              <div
                className={`flex gap-3 px-2 py-1.5 leading-relaxed transition-colors ${
                  inClip
                    ? `bg-accent/[0.08] text-[14px] ${prevIn ? "" : "rounded-t-lg"} ${nextIn ? "" : "rounded-b-lg"}`
                    : "rounded-lg text-[13px] text-fg-2 hover:bg-hover"
                }`}
              >
                <button
                  onClick={() => onSelectSegment(s)}
                  className="w-10 shrink-0 pt-px text-left font-mono text-[11px] text-fg-3 tabular-nums hover:text-accent"
                  title="Jump here"
                >
                  {timecode(s.start)}
                </button>
                {inClip ? (
                  <span>
                    {words
                      .filter((w) => w.start >= s.start - 0.05 && w.start < s.end)
                      .map((w, j) => {
                        const outside = w.end <= clip.start || w.start >= clip.end;
                        const active = time >= w.start && time < w.end + 0.05;
                        return (
                          <span key={j}>
                            <button
                              onClick={() => onSeek(w.start)}
                              className={`rounded px-px transition-colors duration-150 ${
                                outside ? "text-fg-3" : active ? "bg-accent text-white" : time >= w.start ? "text-fg" : "text-fg-2 hover:text-fg"
                              }`}
                            >
                              {w.word}
                            </button>{" "}
                          </span>
                        );
                      })}
                  </span>
                ) : (
                  <span>{s.text}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
