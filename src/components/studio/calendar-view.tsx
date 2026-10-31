"use client";

import { useEffect, useRef, useState } from "react";
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
  const feedbackEntry = feedbackFor ? entries.find((e) => e.id === feedbackFor) : undefined;
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

      <div className="scroll-thin grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 sm:grid-cols-2 lg:grid-cols-7 lg:grid-rows-[minmax(0,1fr)] lg:gap-px lg:bg-white/[0.04] lg:p-0">
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
              className={`flex flex-col gap-2 bg-[#121215] p-2.5 transition-colors max-lg:rounded-xl max-lg:border max-lg:border-hairline lg:min-h-40 lg:overflow-hidden lg:pb-16 ${
                past && !dayEntries.length ? "" : "max-lg:min-h-24"
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

              {/* On desktop each day scrolls on its own, so a busy day can't spill out of the calendar. */}
              <div className="scroll-thin -mx-1 flex flex-col gap-2 px-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
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
                      <span className="-mr-1 -mt-1 flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <a
                          href={googleCalendarUrl(e, local ? clips.find((c) => c.id === e.clipId) : undefined)}
                          target="_blank"
                          rel="noreferrer"
                          className="grid size-5 place-items-center rounded text-fg-3 hover:bg-white/10 hover:text-fg"
                          title="Add to Google Calendar, with the time and the captions to publish"
                          aria-label={`Add ${e.clipTitle} to Google Calendar`}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                            <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
                            <path d="M3.5 10h17M8 3v4M16 3v4" />
                          </svg>
                        </a>
                        <button
                          className="grid size-5 place-items-center rounded text-fg-3 hover:bg-white/10 hover:text-fg"
                          onClick={() => unschedule(e.id)}
                          aria-label={`Remove ${e.clipTitle} from ${iso}`}
                          title="Remove"
                        >
                          <IconClose size={11} />
                        </button>
                      </span>
                    </div>
                    <button className="mt-0.5 block text-left text-[13px] font-medium leading-snug hover:text-accent" onClick={() => local && onOpenClip(e.clipId)}>
                      {e.clipTitle}
                    </button>
                    {!local ? <p className="mt-0.5 truncate text-[10px] text-fg-3">{e.projectName}</p> : null}
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                      <span
                        className="flex min-w-0 items-center gap-1"
                        title={(e.platforms.length ? PLATFORMS.filter((p) => e.platforms.includes(p.id)) : PLATFORMS).map((p) => p.name).join(", ")}
                      >
                        {(e.platforms.length ? PLATFORMS.filter((p) => e.platforms.includes(p.id)) : PLATFORMS).map((p) => (
                          <span key={p.id} className="size-1.5 rounded-full" style={{ background: p.color }} />
                        ))}
                        <span className="ml-0.5 whitespace-nowrap text-[10px] text-fg-3">
                          {!e.platforms.length || e.platforms.length === PLATFORMS.length
                            ? "All platforms"
                            : PLATFORMS.filter((p) => e.platforms.includes(p.id)).map((p) => p.short).join(", ")}
                        </span>
                      </span>
                      {!badge && local ? (
                        <button
                          className="shrink-0 text-[10px] text-fg-3 opacity-0 transition-opacity hover:text-accent group-hover:opacity-100 focus:opacity-100"
                          onClick={() => setFeedbackFor(e.id)}
                        >
                          How did it do?
                        </button>
                      ) : null}
                    </div>
                    {badge ? (
                      <p className="mt-1.5 flex items-center gap-1.5 text-[10px]">
                        <span className={`rounded px-1.5 py-px font-semibold ${badge.cls}`}>{badge.text}</span>
                        <span className="truncate text-fg-3">{learning?.metric}</span>
                      </p>
                    ) : null}
                  </article>
                );
              })}

              {past && !dayEntries.length ? <p className="px-0.5 text-[11px] text-fg-3">No posts</p> : null}
              </div>
              {past ? null : (
                <button
                  className="mt-auto shrink-0 rounded-lg border border-dashed border-white/10 py-1.5 text-[11px] text-fg-3 transition-colors hover:border-accent/50 hover:bg-accent/5 hover:text-fg"
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

      {feedbackEntry ? (
        <FeedbackDialog
          entry={feedbackEntry}
          busy={busy}
          onClose={() => setFeedbackFor(null)}
          onSave={(sentence) => {
            setFeedbackFor(null);
            onFeedback(feedbackEntry, sentence);
          }}
        />
      ) : null}

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

const OUTCOMES = [
  { id: "hit", label: "Hit", hint: "Beat your usual numbers", icon: "▲", on: "border-success/60 bg-success/10 text-success" },
  { id: "average", label: "OK", hint: "About what you expected", icon: "●", on: "border-white/30 bg-white/[0.08] text-fg" },
  { id: "flop", label: "Flop", hint: "Fell short", icon: "▼", on: "border-danger/60 bg-danger/10 text-danger" },
] as const;

/**
 * "How did it do?": the result becomes a sentence sent through the studio chat, where it's saved as
 * a learning and re-ranks clips, exactly as if the creator had said it.
 */
function FeedbackDialog({
  entry,
  busy,
  onSave,
  onClose,
}: {
  entry: CalendarEntry;
  busy: boolean;
  onSave: (sentence: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const posted = entry.platforms.length ? PLATFORMS.filter((p) => entry.platforms.includes(p.id)) : PLATFORMS;
  const [outcome, setOutcome] = useState<(typeof OUTCOMES)[number]["id"]>("hit");
  const [platform, setPlatform] = useState(posted.length === 1 ? posted[0].id : "");
  const [views, setViews] = useState("");
  const [note, setNote] = useState("");
  const when = parseIso(entry.date).toLocaleDateString("en-US", { weekday: "long" });

  useEffect(() => {
    const d = ref.current;
    if (d?.open && !d.matches(":modal")) d.removeAttribute("open");
    if (d && !d.open) d.showModal();
  }, []);

  function save() {
    const p = PLATFORMS.find((x) => x.id === platform);
    const result = outcome === "hit" ? "did really well" : outcome === "flop" ? "flopped" : "did okay";
    onSave(
      `The "${entry.clipTitle}" clip we posted ${when}${p ? ` on ${p.name}` : ""} ${result}${
        views ? `, it got ${Number(views).toLocaleString("en-US")} views` : ""
      }.${note.trim() ? ` ${note.trim()}` : ""}`
    );
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto max-h-[92dvh] w-[min(94vw,28rem)] overflow-hidden rounded-2xl bg-transparent p-0 text-fg backdrop:bg-black/55 backdrop:backdrop-blur-sm"
      aria-label="How did it do?"
    >
      <div className="window rise flex max-h-[92dvh] flex-col overflow-hidden rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold">How did it do?</h2>
            <p className="truncate text-xs text-fg-3">
              {entry.clipTitle} · posted {parseIso(entry.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            </p>
          </div>
          <button className="btn btn-ghost h-8 w-8 shrink-0 p-0" onClick={onClose} aria-label="Close">
            <IconClose size={16} />
          </button>
        </div>

        <div className="scroll-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <fieldset>
            <legend className="label mb-2">Result</legend>
            <div className="grid grid-cols-3 gap-2" role="radiogroup">
              {OUTCOMES.map((o) => (
                <button
                  key={o.id}
                  role="radio"
                  aria-checked={outcome === o.id}
                  onClick={() => setOutcome(o.id)}
                  className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition-colors ${
                    outcome === o.id ? o.on : "border-hairline bg-white/[0.03] text-fg-2 hover:border-hairline-strong hover:text-fg"
                  }`}
                >
                  <span className="text-base leading-none">{o.icon}</span>
                  <span className="text-sm font-semibold">{o.label}</span>
                  <span className="text-[10px] leading-tight text-fg-3">{o.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {posted.length > 1 ? (
            <fieldset>
              <legend className="label mb-2">Where</legend>
              <div className="flex flex-wrap gap-1.5">
                {[{ id: "", name: "All platforms", color: "" }, ...posted].map((p) => (
                  <button
                    key={p.id || "all"}
                    onClick={() => setPlatform(p.id)}
                    aria-pressed={platform === p.id}
                    className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
                      platform === p.id ? "border-accent bg-accent text-white" : "border-hairline bg-white/[0.03] text-fg-2 hover:border-hairline-strong hover:text-fg"
                    }`}
                  >
                    {p.color ? <span className="size-1.5 rounded-full" style={{ background: p.color }} /> : null}
                    {p.name}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}

          <label className="block">
            <span className="label">Views (optional)</span>
            <input
              className="field mt-2"
              inputMode="numeric"
              placeholder="e.g. 40,000"
              value={views ? Number(views).toLocaleString("en-US") : ""}
              onChange={(e) => setViews(e.target.value.replace(/[^\d]/g, "").slice(0, 10))}
            />
          </label>

          <label className="block">
            <span className="label">What do you think happened? (optional)</span>
            <textarea
              className="field mt-2 h-auto resize-none py-2.5 leading-relaxed"
              rows={2}
              maxLength={300}
              placeholder="e.g. The hook landed in the first second"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <p className="text-[11px] leading-relaxed text-fg-3">Saved as a learning in Brand memory, and used to re-rank clips here and in future uploads.</p>
        </div>

        <div className="flex justify-end gap-2 border-t border-hairline px-5 py-3.5">
          <button className="btn btn-ghost h-9 text-xs" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary h-9 text-xs" disabled={busy} onClick={save}>
            Save result
          </button>
        </div>
      </div>
    </dialog>
  );
}
