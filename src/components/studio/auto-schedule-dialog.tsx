"use client";

import { useEffect, useRef, useState } from "react";
import type { Learning } from "@/lib/brand-rules";
import { addDays, isoDate, parseIso, type CalendarEntry } from "@/lib/calendar";
import type { PlanItem } from "@/lib/studio-ai";
import { planAI } from "@/lib/studio-client";
import { PLATFORMS, type Clip } from "@/lib/types";
import { IconCheck, IconClose, IconSparkle } from "../icons";
import { formatTime } from "./schedule-dialog";

/**
 * "Auto-schedule": pick clips, and the AI plans which day, time and platforms each one goes out on,
 * best clips first and clear of posts already on the calendar. The plan is shown for review before
 * anything is added.
 */
export function AutoScheduleDialog({
  clips,
  entries,
  learnings,
  projectId,
  onClose,
  onAdd,
}: {
  clips: Clip[];
  entries: CalendarEntry[];
  learnings: Learning[];
  projectId: string;
  onClose: () => void;
  onAdd: (plan: PlanItem[]) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const scheduled = new Set(entries.filter((e) => e.projectId === projectId).map((e) => e.clipId));
  // Default to the best clips that aren't on the calendar yet.
  const [picked, setPicked] = useState<string[]>(() => clips.filter((c) => !scheduled.has(c.id)).slice(0, 5).map((c) => c.id));
  const [perDay, setPerDay] = useState(1);
  const [plan, setPlan] = useState<PlanItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleOf = (id: string) => clips.find((c) => c.id === id)?.title ?? "Clip";

  useEffect(() => {
    const d = ref.current;
    if (d?.open && !d.matches(":modal")) d.removeAttribute("open");
    if (d && !d.open) d.showModal();
  }, []);

  async function makePlan() {
    setBusy(true);
    setError(null);
    try {
      // From tomorrow, so no suggested time has already passed.
      const days = Array.from({ length: 14 }, (_, i) => isoDate(addDays(new Date(), i + 1)));
      const taken = entries.filter((e) => e.date >= days[0]).map((e) => ({ date: e.date, time: e.time, title: e.clipTitle }));
      const chosen = clips.filter((c) => picked.includes(c.id));
      const result = await planAI(
        chosen.map(({ id, title, hook, start, end, score }) => ({ id, title, hook, start, end, score })),
        days,
        taken,
        learnings,
        perDay
      );
      if (!result.length) throw new Error("The planner didn't return a schedule. Try again.");
      setPlan(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't plan the schedule.");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const day = (d: string) => parseIso(d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && !busy && onClose()}
      className="m-auto max-h-[92dvh] w-[min(94vw,36rem)] overflow-hidden rounded-2xl bg-transparent p-0 text-fg backdrop:bg-black/55 backdrop:backdrop-blur-sm"
      aria-label="Auto-schedule with AI"
    >
      <div className="window rise flex max-h-[92dvh] flex-col overflow-hidden rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-[10px] bg-gradient-to-br from-[#2b95ff] via-[#5e5ce6] to-[#bf5af2] text-white">
              <IconSparkle size={15} />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold">Auto-schedule with AI</h2>
              <p className="text-xs text-fg-3">{plan ? "Review the plan, then add it to your calendar" : "Pick clips; the AI picks the days, times and platforms"}</p>
            </div>
          </div>
          <button className="btn btn-ghost h-8 w-8 shrink-0 p-0" onClick={onClose} aria-label="Close" disabled={busy}>
            <IconClose size={16} />
          </button>
        </div>

        <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {plan ? (
            <ol className="space-y-2">
              {plan.map((item) => (
                <li key={item.clipId} className="rise flex gap-3 rounded-xl border border-hairline bg-white/[0.03] p-3">
                  <div className="w-20 shrink-0">
                    <p className="text-[12px] font-semibold">{day(item.date)}</p>
                    <p className="text-[11px] tabular-nums text-fg-3">{item.time ? formatTime(item.time) : "Any time"}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{titleOf(item.clipId)}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-1">
                      {PLATFORMS.filter((p) => item.platforms.includes(p.id)).map((p) => (
                        <span key={p.id} className="flex items-center gap-1 rounded bg-white/6 px-1.5 py-px text-[10px] text-fg-2">
                          <span className="size-1.5 rounded-full" style={{ background: p.color }} />
                          {p.short}
                        </span>
                      ))}
                    </p>
                    {item.reason ? <p className="mt-1.5 text-[11px] leading-relaxed text-fg-3">{item.reason}</p> : null}
                  </div>
                  <button
                    className="btn btn-ghost h-7 w-7 shrink-0 p-0"
                    onClick={() => setPlan((p) => p?.filter((x) => x.clipId !== item.clipId) ?? null)}
                    aria-label={`Leave ${titleOf(item.clipId)} out`}
                    title="Leave this one out"
                  >
                    <IconClose size={13} />
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <>
              <fieldset>
                <legend className="sr-only">Clips</legend>
                <div className="mb-2 flex items-center justify-between">
                  <span className="label">Clips to schedule</span>
                  <button
                    className="text-[11px] text-accent hover:underline"
                    onClick={() => setPicked(picked.length === clips.length ? [] : clips.map((c) => c.id))}
                  >
                    {picked.length === clips.length ? "Select none" : "Select all"}
                  </button>
                </div>
                <div className="space-y-1.5">
                  {clips.map((c, i) => {
                    const on = picked.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => toggle(c.id)}
                        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                          on ? "border-accent/70 bg-accent/10" : "border-hairline bg-white/[0.02] hover:border-hairline-strong"
                        }`}
                      >
                        <span className={`grid size-5 shrink-0 place-items-center rounded-md border ${on ? "border-accent bg-accent text-white" : "border-white/25"}`}>
                          {on ? <IconCheck size={12} /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">
                            {c.score ? <span className="mr-1.5 text-fg-3">#{i + 1}</span> : null}
                            {c.title}
                          </span>
                          <span className="block truncate text-[11px] text-fg-3">&ldquo;{c.hook}&rdquo;</span>
                        </span>
                        {scheduled.has(c.id) ? <span className="shrink-0 text-[10px] text-fg-3">Already scheduled</span> : null}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="flex items-center justify-between gap-3">
                <legend className="sr-only">Posts per day</legend>
                <span className="label">Posts per day</span>
                <div className="segmented">
                  {[1, 2, 3].map((n) => (
                    <button key={n} data-active={perDay === n} onClick={() => setPerDay(n)} className="w-10">
                      {n}
                    </button>
                  ))}
                </div>
              </fieldset>
              <p className="text-[11px] leading-relaxed text-fg-3">
                Starts tomorrow with {perDay} post{perDay === 1 ? "" : "s"} a day: strongest clips first, times that suit each platform, and
                no clashes with posts already on your calendar{learnings.length ? ", using your past results" : ""}.
              </p>
            </>
          )}
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-hairline px-5 py-3.5">
          {plan ? (
            <>
              <button className="btn btn-ghost h-9 text-xs" onClick={() => setPlan(null)}>
                Back
              </button>
              <div className="flex gap-2">
                <button className="btn btn-secondary h-9 text-xs" onClick={makePlan} disabled={busy}>
                  {busy ? "Re-planning…" : "Re-plan"}
                </button>
                <button className="btn btn-primary h-9 text-xs" disabled={!plan.length || busy} onClick={() => onAdd(plan)}>
                  Add {plan.length} post{plan.length === 1 ? "" : "s"} to calendar
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="text-xs text-fg-3">{picked.length} selected</span>
              <button className="btn btn-primary h-9 text-xs" disabled={!picked.length || busy} onClick={makePlan}>
                {busy ? (
                  <>
                    <span className="size-3.5 animate-spin rounded-full border-2 border-white/60 border-t-transparent" /> Planning {picked.length} posts…
                  </>
                ) : (
                  <>
                    <IconSparkle size={14} /> Plan with AI
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
