"use client";

import { useEffect, useRef, useState } from "react";
import { addDays, isoDate, parseIso } from "@/lib/calendar";
import { timecode } from "@/lib/format";
import { PLATFORMS, type Clip, type PlatformId } from "@/lib/types";
import { IconCheck, IconClose } from "../icons";

export type ScheduleInput = { clip: Clip; date: string; time: string; platforms: PlatformId[] };

const PRESETS = ["09:00", "12:00", "15:00", "18:00", "21:00"];
const SLOTS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

export function formatTime(t: string) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
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

  // Two weeks from today, stretched to include the day it was opened from.
  const span = Math.max(14, Math.round((parseIso(day).getTime() - parseIso(today).getTime()) / 86_400_000) + 7);
  const days = Array.from({ length: span }, (_, i) => isoDate(addDays(parseIso(today), i)));

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    // Bring the chosen clip and day into view inside their scrolling lists.
    d?.querySelectorAll<HTMLElement>("[data-chosen]").forEach((el) => el.scrollIntoView({ block: "nearest", inline: "center" }));
  }, []);

  const toggle = (id: PlatformId) => setPlatforms((ps) => (ps.includes(id) ? ps.filter((p) => p !== id) : [...ps, id]));
  const custom = time && !PRESETS.includes(time);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto max-h-[92dvh] w-[min(94vw,34rem)] overflow-visible rounded-2xl bg-transparent p-0 text-fg backdrop:bg-black/55 backdrop:backdrop-blur-sm"
      aria-label="Schedule a post"
    >
      <div className="window rise flex max-h-[92dvh] flex-col rounded-2xl">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
          <div>
            <h2 className="text-[15px] font-semibold">Schedule a post</h2>
            <p className="text-xs text-fg-3">Adds it to your content calendar</p>
          </div>
          <button className="btn btn-ghost h-8 w-8 p-0" onClick={onClose} aria-label="Close">
            <IconClose size={16} />
          </button>
        </div>

        <div className="scroll-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <fieldset>
            <legend className="label mb-2">Clip</legend>
            <div className="scroll-thin max-h-52 space-y-1.5 overflow-y-auto pr-1" role="radiogroup">
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
            <legend className="label mb-2">Day</legend>
            <div className="scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1.5 [mask-image:linear-gradient(to_right,black_88%,transparent)]">
              {days.map((d) => {
                const on = d === day;
                return (
                  <button
                    key={d}
                    data-chosen={on || undefined}
                    onClick={() => setDay(d)}
                    aria-pressed={on}
                    className={`flex w-14 shrink-0 flex-col items-center rounded-xl border py-2 transition-colors ${
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
              <select
                value={custom ? time : ""}
                onChange={(e) => e.target.value && setTime(e.target.value)}
                aria-label="Other time"
                className={`h-8 rounded-lg border bg-transparent px-2.5 text-xs font-medium [color-scheme:dark] ${
                  custom ? "border-accent bg-accent/15 text-fg" : "border-hairline text-fg-2"
                }`}
              >
                <option value="">Other…</option>
                {SLOTS.map((t) => (
                  <option key={t} value={t}>
                    {formatTime(t)}
                  </option>
                ))}
              </select>
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
