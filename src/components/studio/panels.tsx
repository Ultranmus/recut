"use client";

import { useEffect, useRef, useState } from "react";
import { duration, timecode } from "@/lib/format";
import { diffWords } from "@/lib/diff";
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

function BeforeAfter({ change, onAccept, onReject }: { change: PendingChange; onAccept: () => void; onReject: () => void }) {
  const parts = diffWords(change.before, change.after);
  return (
    <div className="rise mb-2.5 overflow-hidden rounded-lg border border-accent/30 bg-accent/[0.06]">
      <div className="flex items-center justify-between gap-2 border-b border-accent/20 px-3 py-1.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-accent">
          <IconSparkle size={12} className="shrink-0" />
          <span className="truncate">{change.source === "brief" ? "From your brief" : "Brand rule"} · {change.reason}</span>
        </span>
      </div>
      <div className="grid gap-px bg-white/5 text-[12px] leading-relaxed">
        <div className="bg-[#16161a] px-3 py-2">
          <p className="label mb-1 text-[9px]">Before</p>
          <p className="whitespace-pre-wrap">
            {parts.map((d, i) =>
              d.type === "added" ? null : (
                <span key={i} className={d.type === "removed" ? "rounded-sm bg-danger/15 text-danger line-through decoration-danger/60" : "text-fg-3"}>
                  {d.text}
                </span>
              )
            )}
          </p>
        </div>
        <div className="bg-[#16161a] px-3 py-2">
          <p className="label mb-1 text-[9px]">After</p>
          <p className="whitespace-pre-wrap">
            {parts.map((d, i) =>
              d.type === "removed" ? null : (
                <span key={i} className={d.type === "added" ? "rounded-sm bg-success/15 text-success" : "text-fg-2"}>
                  {d.text}
                </span>
              )
            )}
          </p>
        </div>
      </div>
      <div className="flex justify-end gap-1.5 px-2 py-1.5">
        <button className="btn btn-ghost h-7 px-2.5 text-[11px]" onClick={onReject}>
          Keep original
        </button>
        <button className="btn btn-primary h-7 px-2.5 text-[11px]" onClick={onAccept}>
          Accept
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
        <div className="flex items-center justify-between gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2">
          <span className="text-xs">
            {pendingCount} suggested change{pendingCount === 1 ? "" : "s"} below
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
              <BeforeAfter change={pending[p.id]!} onAccept={() => onAccept(p.id)} onReject={() => onReject(p.id)} />
            ) : null}
            <AutoTextarea
              value={text}
              label={`${p.name} caption`}
              onChange={(v) => onChange({ ...clip, captions: { ...clip.captions, [p.id]: v } })}
              onCommit={(before, after) => onCommitEdit(p.id, before, after)}
            />
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
export function ClipDetails({ clip, rank, onChange }: { clip: Clip; rank: number; onChange: (c: Clip) => void }) {
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
  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div className="mb-1.5 flex justify-between text-[10px] text-fg-3">
        <span className="label text-[10px]">Full episode</span>
        <span className="font-mono tabular-nums">{timecode(total)}</span>
      </div>
      <div className="relative h-7 rounded-lg bg-white/[0.05] ring-1 ring-inset ring-white/5">
        {clips.map((c, i) => {
          const active = c.id === selectedId;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              title={`${c.title} · ${timecode(c.start)}–${timecode(c.end)}`}
              aria-label={`Select ${c.title}`}
              className={`absolute inset-y-1 rounded-[5px] text-[9px] font-semibold transition-all duration-200 ${
                active ? "z-10 bg-accent text-white shadow-[0_0_12px_rgba(10,132,255,0.6)]" : "bg-white/20 text-transparent hover:bg-white/35"
              }`}
              style={{ left: `${(c.start / total) * 100}%`, width: `max(6px, ${((c.end - c.start) / total) * 100}%)` }}
            >
              {active ? i + 1 : ""}
            </button>
          );
        })}
        <span
          className="pointer-events-none absolute inset-y-0 z-20 w-px bg-white shadow-[0_0_6px_white]"
          style={{ left: `${Math.min(100, (time / total) * 100)}%` }}
        />
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
  const activeRef = useRef<HTMLDivElement>(null);
  const firstInClip = segments.findIndex((s) => s.end > clip.start);

  useEffect(() => {
    // Scroll only the inspector column; scrollIntoView would also scroll the page.
    const el = activeRef.current;
    const box = el?.closest<HTMLElement>("[data-scroll]");
    if (!el || !box) return;
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTo({ top: top - box.clientHeight / 3, behavior: "smooth" });
  }, [clip.id]);

  return (
    <div className="space-y-5">
      <section>
        <h3 className="label mb-2">In this clip</h3>
        <p className="text-[15px] leading-[1.75]">
          {words.map((w, i) => {
            const active = time >= w.start && time < w.end + 0.05;
            const spoken = time >= w.start;
            return (
              <span key={i}>
                <button
                  onClick={() => onSeek(w.start)}
                  className={`rounded px-0.5 transition-colors duration-150 ${
                    active ? "bg-accent text-white" : spoken ? "text-fg" : "text-fg-3 hover:text-fg-2"
                  }`}
                >
                  {w.word}
                </button>{" "}
              </span>
            );
          })}
        </p>
      </section>

      <section>
        <h3 className="label mb-2">Full episode</h3>
        <div className="space-y-0.5">
          {segments.map((s, i) => {
            const inClip = s.start < clip.end && s.end > clip.start;
            return (
              <div
                key={s.id}
                ref={i === firstInClip ? activeRef : undefined}
                className={`group flex gap-3 rounded-lg px-2 py-1.5 text-[13px] leading-relaxed transition-colors ${
                  inClip ? "bg-accent/10 text-fg" : "text-fg-2 hover:bg-hover"
                }`}
              >
                <button
                  onClick={() => onSelectSegment(s)}
                  className="w-10 shrink-0 pt-px text-left font-mono text-[11px] text-fg-3 tabular-nums hover:text-accent"
                  title="Jump here"
                >
                  {timecode(s.start)}
                </button>
                <span>{s.text}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
