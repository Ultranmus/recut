"use client";

import { useEffect, useRef, useState } from "react";
import type { CalendarEntry } from "./calendar";
import { eventDetails, eventTitle } from "./calendar-export";
import type { Clip } from "./types";

/**
 * One-way sync of Recut's calendar into the creator's Google Calendar: every
 * scheduled post becomes an event, moves and removals follow. Uses Google Identity Services in the
 * browser, so the access token never touches our server. Needs NEXT_PUBLIC_GOOGLE_CLIENT_ID.
 */

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const TOKEN_KEY = "recut:gcal-token";
const MAP_KEY = "recut:gcal-events";

type Token = { value: string; expires: number };
type Synced = Record<string, { eventId: string; hash: string }>;

type TokenResponse = { access_token?: string; expires_in?: number; error?: string };
type GoogleOAuth = {
  accounts: {
    oauth2: {
      initTokenClient: (cfg: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string }) => void }) => {
        requestAccessToken: (o?: { prompt?: string }) => void;
      };
      revoke: (token: string, done?: () => void) => void;
    };
  };
};

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

let gisPromise: Promise<GoogleOAuth> | null = null;
function loadGis(): Promise<GoogleOAuth> {
  const w = window as unknown as { google?: GoogleOAuth };
  if (w.google?.accounts?.oauth2) return Promise.resolve(w.google);
  gisPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => (w.google ? resolve(w.google) : reject(new Error("Google sign-in didn't load.")));
    s.onerror = () => {
      gisPromise = null;
      reject(new Error("Couldn't reach Google. Check your connection."));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

/** Opens Google's consent popup (must be called from a click) and returns a 1-hour access token. */
async function requestToken(prompt: "consent" | ""): Promise<Token> {
  const google = await loadGis();
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        if (!r.access_token) return reject(new Error(r.error === "access_denied" ? "Calendar access wasn't granted." : "Google sign-in failed."));
        resolve({ value: r.access_token, expires: Date.now() + ((r.expires_in ?? 3600) - 60) * 1000 });
      },
      error_callback: (e) => reject(new Error(e.type === "popup_closed" ? "The Google window was closed." : "Google sign-in was blocked. Allow pop-ups and try again.")),
    });
    client.requestAccessToken({ prompt });
  });
}

const pad = (n: number) => String(n).padStart(2, "0");
function plus30(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  const t = new Date(y, m - 1, d, h, min + 30);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}:00`;
}
function nextDay(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(y, m - 1, d + 1);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

function eventBody(e: CalendarEntry, clip: Clip | undefined) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    summary: eventTitle(e),
    description: eventDetails(e, clip),
    start: e.time ? { dateTime: `${e.date}T${e.time}:00`, timeZone: tz } : { date: e.date },
    end: e.time ? { dateTime: plus30(e.date, e.time), timeZone: tz } : { date: nextDay(e.date) },
    reminders: { useDefault: false, overrides: e.time ? [{ method: "popup", minutes: 30 }] : [] },
    source: { title: "Recut", url: `${window.location.origin}/studio/${e.projectId}` },
  };
}

const hashOf = (e: CalendarEntry, clip: Clip | undefined) =>
  JSON.stringify([e.date, e.time, e.platforms, e.clipTitle, clip ? Object.values(clip.captions).join("|").length : 0]);

async function call(token: string, method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw Object.assign(new Error("Google sign-in expired."), { expired: true });
  // An event deleted by hand in Google Calendar: skip the delete, or re-create it instead of patching.
  if ((res.status === 404 || res.status === 410) && method !== "POST") return null;
  if (!res.ok) {
    const msg = await res.json().then((j) => j?.error?.message as string | undefined).catch(() => undefined);
    throw new Error(msg ?? `Google Calendar error (${res.status}).`);
  }
  return method === "DELETE" ? null : ((await res.json()) as { id: string });
}

export type SyncStatus = "off" | "syncing" | "synced" | "expired" | "error";

/**
 * Keeps Google Calendar in step with Recut's calendar while connected. Changes sync a moment after
 * they happen; when the 1-hour token lapses, the creator reconnects with one click.
 */
export function useGoogleCalendarSync(entries: CalendarEntry[], clipFor: (e: CalendarEntry) => Clip | undefined) {
  const [token, setToken] = useState<Token | null>(null);
  const [status, setStatus] = useState<SyncStatus>("off");
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const running = useRef(false);
  const clipForRef = useRef(clipFor);
  useEffect(() => {
    clipForRef.current = clipFor;
  });

  // Pick up a still-valid token from this browser session.
  useEffect(() => {
    const t = read<Token | null>(TOKEN_KEY, null);
    if (!t) return;
    const timer = setTimeout(() => {
      if (t.expires > Date.now()) {
        setToken(t);
        setStatus("synced");
      } else setStatus("expired");
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!token) return;
    const timer = setTimeout(async () => {
      if (running.current) return;
      if (token.expires <= Date.now()) {
        setStatus("expired");
        return;
      }
      running.current = true;
      setStatus("syncing");
      try {
        const synced = read<Synced>(MAP_KEY, {});
        const live = new Set(entries.map((e) => e.id));
        for (const e of entries) {
          const clip = clipForRef.current(e);
          const hash = hashOf(e, clip);
          const known = synced[e.id];
          if (known?.hash === hash) continue;
          const body = eventBody(e, clip);
          const patched = known ? await call(token.value, "PATCH", `${API}/${encodeURIComponent(known.eventId)}`, body) : null;
          const r = patched ?? (await call(token.value, "POST", API, body));
          synced[e.id] = { eventId: r!.id, hash };
          write(MAP_KEY, synced);
        }
        for (const [id, { eventId }] of Object.entries(synced)) {
          if (live.has(id)) continue;
          await call(token.value, "DELETE", `${API}/${encodeURIComponent(eventId)}`);
          delete synced[id];
          write(MAP_KEY, synced);
        }
        setStatus("synced");
        setError(null);
        setLastSync(Date.now());
      } catch (err) {
        const expired = (err as { expired?: boolean }).expired;
        setStatus(expired ? "expired" : "error");
        setError(err instanceof Error ? err.message : "Sync failed.");
        if (expired) write(TOKEN_KEY, null);
      } finally {
        running.current = false;
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [token, entries]);

  async function connect() {
    setError(null);
    try {
      const t = await requestToken(status === "off" ? "consent" : "");
      write(TOKEN_KEY, t);
      setToken(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't connect.");
    }
  }

  async function disconnect() {
    const t = token;
    setToken(null);
    setStatus("off");
    setError(null);
    // Events already in Google Calendar stay there, and the mapping is kept so reconnecting updates
    // them instead of creating duplicates.
    write(TOKEN_KEY, null);
    if (t) {
      const google = await loadGis().catch(() => null);
      google?.accounts.oauth2.revoke(t.value);
    }
  }

  return { enabled: Boolean(GOOGLE_CLIENT_ID), status, error, lastSync, connect, disconnect };
}
