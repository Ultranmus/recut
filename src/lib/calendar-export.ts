import type { CalendarEntry } from "./calendar";
import { timecode } from "./format";
import { PLATFORMS, type Clip } from "./types";

/**
 * Calendar export without OAuth: a pre-filled Google Calendar event link per post, and an .ics
 * file that Google, Apple and Outlook calendars all import. Each event carries the captions to post.
 */

const appUrl = () => (typeof window === "undefined" ? "https://recut.ashvattech.com" : window.location.origin);

function compact(date: string, time: string) {
  return `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
}

function nextDay(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const n = new Date(y, m - 1, d + 1);
  return `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, "0")}${String(n.getDate()).padStart(2, "0")}`;
}

function plusMinutes(time: string, mins: number) {
  const [h, m] = time.split(":").map(Number);
  const t = h * 60 + m + mins;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function platformsOf(e: CalendarEntry) {
  return e.platforms.length ? PLATFORMS.filter((p) => e.platforms.includes(p.id)) : PLATFORMS;
}

export function eventTitle(e: CalendarEntry) {
  return `Post: ${e.clipTitle} (${platformsOf(e)
    .map((p) => p.short)
    .join(", ")})`;
}

export function eventDetails(e: CalendarEntry, clip: Clip | undefined, maxCaption = 600) {
  const lines = [`Hook: ${e.hook}`];
  if (clip) lines.push(`Clip: ${timecode(clip.start)} to ${timecode(clip.end)} of "${e.projectName}"`);
  for (const p of platformsOf(e)) {
    const caption = clip?.captions[p.id];
    if (!caption) continue;
    lines.push("", `${p.name}:`, caption.length > maxCaption ? `${caption.slice(0, maxCaption - 1)}…` : caption);
  }
  lines.push("", `Open in Recut: ${appUrl()}/studio/${e.projectId}`);
  return lines.join("\n");
}

/** A Google Calendar "create event" link. Untimed posts become all-day events. */
export function googleCalendarUrl(e: CalendarEntry, clip: Clip | undefined) {
  const dates = e.time ? `${compact(e.date, e.time)}/${compact(e.date, plusMinutes(e.time, 30))}` : `${e.date.replace(/-/g, "")}/${nextDay(e.date)}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: eventTitle(e),
    dates,
    // Keep the URL comfortably short; Google truncates very long links.
    details: eventDetails(e, clip, 280),
    ctz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Folds lines at 75 octets as RFC 5545 requires. */
function fold(line: string) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
    }
    cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function toIcs(entries: CalendarEntry[], clipFor: (e: CalendarEntry) => Clip | undefined) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Recut//Content calendar//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Recut posts"];
  for (const e of entries) {
    lines.push("BEGIN:VEVENT", `UID:${e.id}@recut`, `DTSTAMP:${stamp}`);
    if (e.time) {
      // Floating local time: the post time means the creator's own clock wherever they open it.
      lines.push(`DTSTART:${compact(e.date, e.time)}`, `DTEND:${compact(e.date, plusMinutes(e.time, 30))}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${e.date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${nextDay(e.date)}`);
    }
    lines.push(`SUMMARY:${esc(eventTitle(e))}`, `DESCRIPTION:${esc(eventDetails(e, clipFor(e)))}`);
    if (e.time) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(eventTitle(e))}`, "TRIGGER:-PT30M", "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
