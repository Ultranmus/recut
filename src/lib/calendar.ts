"use client";

import { createListStore } from "./local-store";
import type { PlatformId } from "./types";

export type CalendarEntry = {
  id: string;
  projectId: string;
  projectName: string;
  clipId: string;
  clipTitle: string;
  hook: string;
  platforms: PlatformId[];
  /** Local date, YYYY-MM-DD. */
  date: string;
  /** Local time, HH:MM, or "" when unspecified. */
  time: string;
  source: "voice" | "manual";
  createdAt: number;
};

const store = createListStore<CalendarEntry>("recut:calendar");

export const useCalendar = store.use;
export const getCalendar = store.read;

export function schedule(items: Omit<CalendarEntry, "id" | "createdAt">[]) {
  const added = items.map((e) => ({ ...e, id: crypto.randomUUID().slice(0, 8), createdAt: Date.now() }));
  store.write([...store.read(), ...added]);
  return added;
}

export const unschedule = (id: string) => store.write(store.read().filter((e) => e.id !== id));

export function moveEntry(id: string, date: string) {
  store.write(store.read().map((e) => (e.id === id ? { ...e, date } : e)));
}

/** YYYY-MM-DD in the browser's local time zone. */
export function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseIso(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Monday of the week containing `d`. */
export function startOfWeek(d: Date) {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
}

export function addDays(d: Date, n: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/**
 * The next 14 days as numbered "N: Weekday YYYY-MM-DD" lines. The model answers with the number
 * and code maps it back, so a model can never invent a wrong year or date.
 */
export function upcomingDates(today = new Date()) {
  return Array.from({ length: 14 }, (_, i) => {
    const d = addDays(today, i);
    const label = i === 0 ? " (today)" : i === 1 ? " (tomorrow)" : "";
    return `${i}: ${d.toLocaleDateString("en-US", { weekday: "long" })} ${isoDate(d)}${label}`;
  }).join("\n");
}
