"use client";

import { useState } from "react";
import type { Learning } from "@/lib/brand-rules";
import { addDays, isoDate, moveEntry, parseIso, schedule, startOfWeek, unschedule, type CalendarEntry } from "@/lib/calendar";
import { PLATFORMS, type Clip, type PlatformId, type Project } from "@/lib/types";
import { IconChevronLeft, IconClose } from "../icons";

export function outcomeBadge(l: Learning) {
  const views = l.views ? (l.views >= 1000 ? `${Math.round(l.views / 100) / 10}K`.replace(".0K", "K") : String(l.views)) : null;
  if (l.outcome === "hit") return { text: `▲ ${views ?? "Hit"}`, cls: "bg-success/15 text-success" };
  if (l.outcome === "flop") return { text: `▼ ${views ?? "Flop"}`, cls: "bg-danger/15 text-danger" };
  return { text: views ?? "Average", cls: "bg-white/8 text-fg-2" };
}

function formatTime(t: string) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function CalendarView({
  project,
  clips,
  entries,
  learnings,
  highlight,
  weekStart,
  onWeekChange,
  onOpenClip,
  onFeedback,
  busy,
}: {
  project: Project;
  clips: Clip[];
  entries: CalendarEntry[];
  learnings: Learning[];
  highlight: string[];
  weekStart: Date;
  onWeekChange: (d: Date) => void;
  onOpenClip: (clipId: string) => void;
  onFeedback: (entry: CalendarEntry, sentence: string) => void;
  busy: boolean;
}) {
  const [adding, setAdding] = useState<string | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const today = isoDate(new Date());
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const end = days[6];
  const md = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const range = `${md(weekStart)} – ${md(end)} ${end.getFullYear()}`;
  const inWeek = entries.filter((e) => e.date >= isoDate(weekStart) && e.date <= isoDate(end));

  return (
    <section className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl" aria-label="Content calendar">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">This week&apos;s posts</h2>
          <p className="text-xs text-fg-3">
            Say “post the Gateway clip on Tuesday” above, or add one here. Drag a post to move it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="mr-1 text-sm font-medium tabular-nums">{range}</span>
          <button className="btn btn-secondary h-8 w-8 p-0" onClick={() => onWeekChange(addDays(weekStart, -7))} aria-label="Previous week">
            <IconChevronLeft size={15} />
          </button>
          <button className="btn btn-secondary h-8 px-3 text-xs" onClick={() => onWeekChange(startOfWeek(new Date()))}>
            Today
          </button>
          <button className="btn btn-secondary h-8 w-8 p-0" onClick={() => onWeekChange(addDays(weekStart, 7))} aria-label="Next week">
            <IconChevronLeft size={15} className="rotate-180" />
          </button>
        </div>
      </header>

      <div className="scroll-thin grid min-h-0 flex-1 grid-cols-1 gap-px overflow-y-auto bg-white/[0.04] sm:grid-cols-7">
        {days.map((d) => {
          const iso = isoDate(d);
          const dayEntries = inWeek.filter((e) => e.date === iso).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
          const isToday = iso === today;
          const past = iso < today;
          return (
            <div
              key={iso}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(iso);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData("text/entry");
                if (id) moveEntry(id, iso);
              }}
              className={`flex min-h-40 flex-col gap-2 bg-[#121215] p-2.5 transition-colors ${dragOver === iso ? "bg-accent/10" : ""} ${
                past ? "opacity-70" : ""
              }`}
            >
              <div className="flex items-baseline justify-between px-0.5">
                <span className={`text-[11px] font-semibold uppercase tracking-wide ${isToday ? "text-accent" : "text-fg-3"}`}>
                  {d.toLocaleDateString(undefined, { weekday: "short" })}
                </span>
                <span
                  className={`grid size-6 place-items-center rounded-full text-xs font-semibold tabular-nums ${
                    isToday ? "bg-accent text-white" : "text-fg-2"
                  }`}
                >
                  {d.getDate()}
                </span>
              </div>

              {dayEntries.map((e) => {
                const local = e.projectId === project.id;
                const learning = learnings.find((l) => l.projectId === e.projectId && l.clipId === e.clipId);
                const badge = learning ? outcomeBadge(learning) : null;
                const fresh = highlight.includes(e.id);
                return (
                  <article
                    key={e.id}
                    draggable
                    onDragStart={(ev) => ev.dataTransfer.setData("text/entry", e.id)}
                    className={`group rise relative cursor-grab rounded-xl border bg-white/[0.04] p-2.5 transition-all active:cursor-grabbing ${
                      fresh
                        ? "border-accent/70 shadow-[0_0_0_3px_rgba(10,132,255,0.25),0_10px_30px_-10px_rgba(10,132,255,0.6)]"
                        : "border-hairline hover:border-hairline-strong"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-medium tabular-nums text-fg-3">{formatTime(e.time) || "Any time"}</span>
                      <button
                        className="-mr-1 -mt-1 grid size-5 place-items-center rounded text-fg-3 opacity-0 transition-opacity hover:bg-white/10 hover:text-fg group-hover:opacity-100"
                        onClick={() => unschedule(e.id)}
                        aria-label={`Remove ${e.clipTitle} from ${iso}`}
                      >
                        <IconClose size={11} />
                      </button>
                    </div>
                    <button className="mt-0.5 block text-left text-[13px] font-medium leading-snug hover:text-accent" onClick={() => local && onOpenClip(e.clipId)}>
                      {e.clipTitle}
                    </button>
                    {!local ? <p className="mt-0.5 truncate text-[10px] text-fg-3">{e.projectName}</p> : null}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {(e.platforms.length ? PLATFORMS.filter((p) => e.platforms.includes(p.id)) : PLATFORMS).map((p) => (
                        <span key={p.id} className="flex items-center gap-1 rounded bg-white/6 px-1 py-px text-[9px] text-fg-2">
                          <span className="size-1 rounded-full" style={{ background: p.color }} />
                          {p.short}
                        </span>
                      ))}
                    </div>
                    {badge ? (
                      <p className="mt-1.5 flex items-center gap-1.5 text-[10px]">
                        <span className={`rounded px-1.5 py-px font-semibold ${badge.cls}`}>{badge.text}</span>
                        <span className="truncate text-fg-3">{learning?.metric}</span>
                      </p>
                    ) : local ? (
                      <button
                        className="mt-1.5 text-[10px] text-fg-3 opacity-0 transition-opacity hover:text-accent group-hover:opacity-100 focus:opacity-100"
                        onClick={() => setFeedbackFor(feedbackFor === e.id ? null : e.id)}
                      >
                        How did it do?
                      </button>
                    ) : null}
                    {feedbackFor === e.id ? (
                      <FeedbackForm
                        busy={busy}
                        onCancel={() => setFeedbackFor(null)}
                        onSave={(sentence) => {
                          setFeedbackFor(null);
                          onFeedback(e, sentence);
                        }}
                        entry={e}
                      />
                    ) : null}
                  </article>
                );
              })}

              {adding === iso ? (
                <AddForm
                  clips={clips}
                  onCancel={() => setAdding(null)}
                  onAdd={(clip, platforms, time) => {
                    schedule([
                      {
                        projectId: project.id,
                        projectName: project.name,
                        clipId: clip.id,
                        clipTitle: clip.title,
                        hook: clip.hook,
                        platforms,
                        date: iso,
                        time,
                        source: "manual",
                      },
                    ]);
                    setAdding(null);
                  }}
                />
              ) : (
                <button
                  className="mt-auto rounded-lg border border-dashed border-transparent py-1.5 text-[11px] text-fg-3 transition-colors hover:border-white/15 hover:text-fg-2"
                  onClick={() => setAdding(iso)}
                >
                  + Add
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AddForm({
  clips,
  onAdd,
  onCancel,
}: {
  clips: Clip[];
  onAdd: (clip: Clip, platforms: PlatformId[], time: string) => void;
  onCancel: () => void;
}) {
  const [clipId, setClipId] = useState(clips[0]?.id ?? "");
  const [platforms, setPlatforms] = useState<PlatformId[]>([]);
  const [time, setTime] = useState("");
  const clip = clips.find((c) => c.id === clipId);
  return (
    <div className="rise space-y-2 rounded-xl border border-accent/40 bg-black/30 p-2">
      <select className="field h-8 px-2 text-xs" value={clipId} onChange={(e) => setClipId(e.target.value)} aria-label="Clip">
        {clips.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-1">
        {PLATFORMS.map((p) => {
          const on = platforms.includes(p.id);
          return (
            <button
              key={p.id}
              onClick={() => setPlatforms(on ? platforms.filter((x) => x !== p.id) : [...platforms, p.id])}
              className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${on ? "bg-white/15 text-fg" : "bg-white/5 text-fg-3"}`}
              aria-pressed={on}
            >
              {p.short}
            </button>
          );
        })}
      </div>
      <input type="time" className="field h-8 px-2 text-xs" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" />
      <div className="flex gap-1">
        <button className="btn btn-ghost h-7 flex-1 px-2 text-[11px]" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary h-7 flex-1 px-2 text-[11px]" disabled={!clip} onClick={() => clip && onAdd(clip, platforms, time)}>
          Add
        </button>
      </div>
    </div>
  );
}

function FeedbackForm({
  entry,
  busy,
  onSave,
  onCancel,
}: {
  entry: CalendarEntry;
  busy: boolean;
  onSave: (sentence: string) => void;
  onCancel: () => void;
}) {
  const [outcome, setOutcome] = useState<"hit" | "average" | "flop">("hit");
  const [views, setViews] = useState("");
  const platform = PLATFORMS.find((p) => entry.platforms.length === 1 && p.id === entry.platforms[0]);
  const when = parseIso(entry.date).toLocaleDateString("en-US", { weekday: "long" });
  return (
    <div className="mt-2 space-y-2 rounded-lg bg-black/30 p-2">
      <div className="segmented w-full">
        {(["hit", "average", "flop"] as const).map((o) => (
          <button key={o} data-active={outcome === o} onClick={() => setOutcome(o)} className="flex-1 px-1 capitalize">
            {o === "average" ? "OK" : o}
          </button>
        ))}
      </div>
      <input
        className="field h-8 px-2 text-xs"
        inputMode="numeric"
        placeholder="Views (optional)"
        value={views}
        onChange={(e) => setViews(e.target.value.replace(/[^\d]/g, ""))}
        aria-label="Views"
      />
      <div className="flex gap-1">
        <button className="btn btn-ghost h-7 flex-1 px-2 text-[11px]" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn btn-primary h-7 flex-1 px-2 text-[11px]"
          disabled={busy}
          onClick={() => {
            const result = outcome === "hit" ? "did really well" : outcome === "flop" ? "flopped" : "did okay";
            onSave(
              `The "${entry.clipTitle}" clip we posted ${when}${platform ? ` on ${platform.name}` : ""} ${result}${
                views ? `, it got ${Number(views).toLocaleString("en-US")} views` : ""
              }.`
            );
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
