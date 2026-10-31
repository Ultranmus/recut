"use client";

import { useEffect, useRef, useState } from "react";
import { addDays, isoDate, parseIso } from "@/lib/calendar";
import { timecode } from "@/lib/format";
import { PLATFORMS, type Clip, type PlatformId } from "@/lib/types";
import { IconCheck, IconChevronLeft, IconClose } from "../icons";

export type ScheduleInput = { clip: Clip; date: string; time: string; platforms: PlatformId[] };

const PRESETS = ["09:00", "12:00", "15:00", "18:00", "21:00"];
const SLOTS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

/** "21:30" → "9:30 PM". Always 12-hour, whatever the browser's locale. */
export function formatTime(t: string) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const dayLabel = (iso: string, opts: Intl.DateTimeFormatOptions) => parseIso(iso).toLocaleDateString(undefined, opts);

/**
 * "Schedule a post": pick the clip, the day, the time and the platforms. Mounted only while open,
 * so each opening starts from the clip or day it was opened from.
 */
export function ScheduleDialog({
  clips,
  clipId,
  date,
  onClose,
  onSchedule,
}: {
  clips: Clip[];
  clipId?: string;
  date?: string;
  onClose: () => void;
  onSchedule: (input: ScheduleInput) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const today = isoDate(new Date());
  const [selected, setSelected] = useState(clipId ?? clips[0]?.id ?? "");
  const [day, setDay] = useState(date && date >= today ? date : today);
  const [time, setTime] = useState("09:00");
  const [platforms, setPlatforms] = useState<PlatformId[]>(PLATFORMS.map((p) => p.id));
  const clip = clips.find((c) => c.id === selected);

  // Seven days at a time from today, paged with arrows, starting on the page that holds the chosen day.
  const daysAhead = Math.round((parseIso(day).getTime() - parseIso(today).getTime()) / 86_400_000);
  const [page, setPage] = useState(Math.max(0, Math.floor(daysAhead / 7)));
  const days = Array.from({ length: 7 }, (_, i) => isoDate(addDays(parseIso(today), page * 7 + i)));
  const pageLabel =
    page === 0 ? "Next 7 days" : `${dayLabel(days[0], { month: "short", day: "numeric" })} – ${dayLabel(days[6], { month: "short", day: "numeric" })}`;

  useEffect(() => {
    const d = ref.current;
    // Next keeps a page alive in the background after you navigate away. When it's shown again the
    // dialog is still "open" but no longer modal (no backdrop), so reopen it properly.
    if (d?.open && !d.matches(":modal")) d.removeAttribute("open");
    if (d && !d.open) d.showModal();
    // Bring the chosen clip into view by scrolling only its list. scrollIntoView would also shift
    // the dialog body and cut off its edge.
    const el = d?.querySelector<HTMLElement>("[data-chosen]");
    const list = el?.parentElement;
    if (el && list) list.scrollTop = el.offsetTop - (list.clientHeight - el.offsetHeight) / 2;
  }, []);

  const toggle = (id: PlatformId) => setPlatforms((ps) => (ps.includes(id) ? ps.filter((p) => p !== id) : [...ps, id]));
  const custom = time && !PRESETS.includes(time);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto max-h-[92dvh] w-[min(94vw,34rem)] overflow-hidden rounded-2xl bg-transparent p-0 text-fg backdrop:bg-black/55 backdrop:backdrop-blur-sm"
      aria-label="Schedule a post"
    >
      <div className="window rise flex max-h-[92dvh] flex-col overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
          <div>
            <h2 className="text-[15px] font-semibold">Schedule a post</h2>
            <p className="text-xs text-fg-3">Adds it to your content calendar</p>
          </div>
          <button className="btn btn-ghost h-8 w-8 p-0" onClick={onClose} aria-label="Close">
            <IconClose size={16} />
          </button>
        </div>

        <div className="scroll-thin min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-5 py-4">
          <fieldset>
            <legend className="label mb-2">Clip</legend>
            <div className="scroll-thin relative max-h-52 space-y-1.5 overflow-y-auto pr-1" role="radiogroup">
              {clips.map((c, i) => {
                const on = c.id === selected;
                return (
                  <button
                    key={c.id}
                    role="radio"
                    aria-checked={on}
                    data-chosen={on || undefined}
                    onClick={() => setSelected(c.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      on ? "border-accent/70 bg-accent/10" : "border-hairline bg-white/[0.02] hover:border-hairline-strong"
                    }`}
                  >
                    <span
                      className={`grid size-5 shrink-0 place-items-center rounded-full border ${on ? "border-accent bg-accent text-white" : "border-white/25"}`}
                    >
                      {on ? <IconCheck size={12} /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">
                        {c.score ? <span className="mr-1.5 text-fg-3">#{i + 1}</span> : null}
                        {c.title}
                      </span>
                      <span className="block truncate text-[11px] text-fg-3">&ldquo;{c.hook}&rdquo;</span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-fg-3">{timecode(c.start)}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="sr-only">Day</legend>
            <div className="mb-2 flex items-center justify-between">
              <span className="label">Day</span>
              <div className="flex items-center gap-1">
                <span className="mr-1 text-[11px] text-fg-3">{pageLabel}</span>
                <button className="btn btn-ghost h-7 w-7 p-0" onClick={() => setPage((p) => p - 1)} disabled={page === 0} aria-label="Previous 7 days">
                  <IconChevronLeft size={14} />
                </button>
                <button className="btn btn-ghost h-7 w-7 p-0" onClick={() => setPage((p) => p + 1)} disabled={page >= 7} aria-label="Next 7 days">
                  <IconChevronLeft size={14} className="rotate-180" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {days.map((d) => {
                const on = d === day;
                return (
                  <button
                    key={d}
                    onClick={() => setDay(d)}
                    aria-pressed={on}
                    aria-label={dayLabel(d, { weekday: "long", month: "long", day: "numeric" })}
                    className={`flex min-w-0 flex-col items-center rounded-xl border py-2 transition-colors ${
                      on ? "border-accent bg-accent text-white" : "border-hairline bg-white/[0.03] text-fg-2 hover:border-hairline-strong hover:text-fg"
                    }`}
                  >
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${on ? "text-white/80" : "text-fg-3"}`}>
                      {d === today ? "Today" : dayLabel(d, { weekday: "short" })}
                    </span>
                    <span className="text-base font-semibold tabular-nums">{parseIso(d).getDate()}</span>
                    <span className={`text-[10px] ${on ? "text-white/80" : "text-fg-3"}`}>{dayLabel(d, { month: "short" })}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="label mb-2">Time</legend>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTime(t)}
                  aria-pressed={time === t}
                  className={`h-8 rounded-lg border px-3 text-xs font-medium tabular-nums transition-colors ${
                    time === t ? "border-accent bg-accent text-white" : "border-hairline bg-white/[0.03] text-fg-2 hover:border-hairline-strong hover:text-fg"
                  }`}
                >
                  {formatTime(t)}
                </button>
              ))}
              <button
                onClick={() => setTime("")}
                aria-pressed={!time}
                className={`h-8 rounded-lg border px-3 text-xs font-medium transition-colors ${
                  !time ? "border-accent bg-accent text-white" : "border-hairline bg-white/[0.03] text-fg-2 hover:border-hairline-strong hover:text-fg"
                }`}
              >
                Any time
              </button>
              <span className="relative inline-flex">
                <select
                  value={custom ? time : ""}
                  onChange={(e) => e.target.value && setTime(e.target.value)}
                  aria-label="Other time"
                  className={`h-8 cursor-pointer appearance-none rounded-lg border bg-transparent pl-3 pr-8 text-xs font-medium [color-scheme:dark] ${
                    custom ? "border-accent bg-accent text-white" : "border-hairline bg-white/[0.03] text-fg-2 hover:border-hairline-strong hover:text-fg"
                  }`}
                >
                  <option value="">Other time</option>
                  {SLOTS.map((t) => (
                    <option key={t} value={t}>
                      {formatTime(t)}
                    </option>
                  ))}
                </select>
                <IconChevronLeft
                  size={13}
                  className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 -rotate-90 ${custom ? "text-white" : "text-fg-3"}`}
                />
              </span>
            </div>
          </fieldset>

          <fieldset>
            <legend className="label mb-2">Platforms</legend>
            <div className="grid grid-cols-2 gap-1.5">
              {PLATFORMS.map((p) => {
                const on = platforms.includes(p.id);
                return (
                  <button
                    key={p.id}
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(p.id)}
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[13px] transition-colors ${
                      on ? "border-white/25 bg-white/[0.07] text-fg" : "border-hairline bg-transparent text-fg-3 hover:text-fg-2"
                    }`}
                  >
                    <span
                      className={`grid size-4 shrink-0 place-items-center rounded-[5px] border ${on ? "border-transparent text-white" : "border-white/25"}`}
                      style={on ? { background: p.id === "x" ? "#3a3a40" : p.color } : undefined}
                    >
                      {on ? <IconCheck size={11} /> : null}
                    </span>
                    {p.name}
                  </button>
                );
              })}
            </div>
            {!platforms.length ? <p className="mt-1.5 text-[11px] text-warning">Pick at least one platform.</p> : null}
          </fieldset>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-3.5">
          <p className="min-w-0 text-xs text-fg-2">
            <span className="font-medium text-fg">{dayLabel(day, { weekday: "short", month: "short", day: "numeric" })}</span>
            {" · "}
            {time ? formatTime(time) : "Any time"}
          </p>
          <div className="ml-auto flex gap-2">
            <button className="btn btn-ghost h-9 text-xs" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary h-9 text-xs"
              disabled={!clip || !platforms.length}
              onClick={() => clip && onSchedule({ clip, date: day, time, platforms })}
            >
              Add to calendar
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
