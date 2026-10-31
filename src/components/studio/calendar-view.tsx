"use client";

import { useState } from "react";
import type { Learning } from "@/lib/brand-rules";
import { addDays, isoDate, moveEntry, parseIso, schedule, startOfWeek, unschedule, type CalendarEntry } from "@/lib/calendar";
import { googleCalendarUrl, toIcs } from "@/lib/calendar-export";
import { download } from "@/lib/format";
import { PLATFORMS, type Clip, type Project } from "@/lib/types";
import { IconChevronLeft, IconClose } from "../icons";
import { formatTime, ScheduleDialog } from "./schedule-dialog";

export function outcomeBadge(l: Learning) {
  const views = l.views ? (l.views >= 1000 ? `${Math.round(l.views / 100) / 10}K`.replace(".0K", "K") : String(l.views)) : null;
  if (l.outcome === "hit") return { text: `▲ ${views ?? "Hit"}`, cls: "bg-success/15 text-success" };
  if (l.outcome === "flop") return { text: `▼ ${views ?? "Flop"}`, cls: "bg-danger/15 text-danger" };
  return { text: views ?? "Average", cls: "bg-white/8 text-fg-2" };
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
            Add a post, drag one to another day, or tell the studio chat &ldquo;post the Gateway clip on Tuesday&rdquo;.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <button className="btn btn-primary h-8 px-3 text-xs max-sm:w-full" onClick={() => setAdding(isoDate(new Date()))} disabled={!clips.length}>
            + Schedule a post
          </button>
          <button
            className="btn btn-secondary order-last h-8 px-3 text-xs max-sm:w-full sm:order-none"
            disabled={!inWeek.length}
            title="Imports into Google Calendar, Apple Calendar or Outlook, with a reminder 30 minutes before each timed post"
            onClick={() =>
              download(
                new Blob([toIcs(inWeek, (e) => (e.projectId === project.id ? clips.find((c) => c.id === e.clipId) : undefined))], {
                  type: "text/calendar",
                }),
                `recut-week-${isoDate(weekStart)}.ics`
              )
            }
          >
            Export week (.ics)
          </button>
          <button className="btn btn-secondary h-8 w-8 p-0" onClick={() => onWeekChange(addDays(weekStart, -7))} aria-label="Previous week">
            <IconChevronLeft size={15} />
          </button>
          <span className="flex-1 text-center text-sm font-medium tabular-nums sm:mx-1 sm:flex-none">{range}</span>
          <button className="btn btn-secondary h-8 w-8 p-0" onClick={() => onWeekChange(addDays(weekStart, 7))} aria-label="Next week">
            <IconChevronLeft size={15} className="rotate-180" />
          </button>
          <button className="btn btn-secondary h-8 px-3 text-xs" onClick={() => onWeekChange(startOfWeek(new Date()))}>
            Today
          </button>
        </div>
      </header>

      <div className="scroll-thin grid min-h-0 flex-1 grid-cols-1 gap-px bg-white/[0.04] sm:grid-cols-2 lg:grid-cols-7 xl:overflow-y-auto">
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
              className={`flex flex-col gap-2 bg-[#121215] p-2.5 transition-colors max-lg:min-h-24 lg:min-h-40 lg:pb-16 ${
                past && !dayEntries.length ? "max-lg:hidden" : ""
              } ${dragOver === iso ? "bg-accent/10" : ""} ${
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
                    <a
                      href={googleCalendarUrl(e, local ? clips.find((c) => c.id === e.clipId) : undefined)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[10px] text-fg-3 hover:text-accent"
                      title="Opens Google Calendar with this post, its time and the captions to publish"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
                        <path d="M3.5 10h17M8 3v4M16 3v4" />
                      </svg>
                      Add to Google Calendar
                    </a>
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

              {past ? null : (
                <button
                  className="mt-auto rounded-lg border border-dashed border-white/10 py-1.5 text-[11px] text-fg-3 transition-colors hover:border-accent/50 hover:bg-accent/5 hover:text-fg"
                  onClick={() => setAdding(iso)}
                  aria-label={`Schedule a post on ${d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`}
                >
                  + Add
                </button>
              )}
            </div>
          );
        })}
      </div>

      {adding ? (
        <ScheduleDialog
          clips={clips}
          date={adding}
          onClose={() => setAdding(null)}
          onSchedule={({ clip, date, time, platforms }) => {
            schedule([
              {
                projectId: project.id,
                projectName: project.name,
                clipId: clip.id,
                clipTitle: clip.title,
                hook: clip.hook,
                platforms,
                date,
                time,
                source: "manual",
              },
            ]);
            setAdding(null);
            onWeekChange(startOfWeek(parseIso(date)));
          }}
        />
      ) : null}
    </section>
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
