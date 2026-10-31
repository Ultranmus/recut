"use client";

import type { BrandRule, Learning } from "./brand-rules";
import { upcomingDates } from "./calendar";
import { getGroqKey } from "./settings";
import { learnRule, parseBrief, planSchedule, rerankClips, rewriteCaptions, type ClipRef, type PlanItem, type RewriteInput } from "./studio-ai";
import type { PlatformId } from "./types";

/** Turns the browser's bare "Failed to fetch" into something a creator can act on. */
function friendly(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("You're offline. Reconnect and try again.");
  if (/failed to fetch|networkerror|load failed/i.test(msg)) throw new Error("Couldn't reach the server. Check your connection and try again.");
  throw err instanceof Error ? err : new Error(msg);
}

/** Uses the user's own key straight from the browser when present, otherwise the server route. */
async function viaServer<T>(body: object): Promise<T> {
  const res = await fetch("/api/studio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed.");
  return data as T;
}

export function briefAI(raw: string, clips: ClipRef[], rules: BrandRule[]) {
  // Dates come from the browser so "Tuesday" resolves in the creator's own time zone.
  const dates = upcomingDates();
  const key = getGroqKey();
  return (
    key
      ? parseBrief(raw, clips, rules, dates, key)
      : viaServer<Awaited<ReturnType<typeof parseBrief>>>({ action: "brief", raw, clips, rules, dates })
  ).catch(friendly);
}

export function rewriteAI(input: RewriteInput) {
  const key = getGroqKey();
  return (key ? rewriteCaptions(input, key) : viaServer<Awaited<ReturnType<typeof rewriteCaptions>>>({ action: "rewrite", input })).catch(
    friendly
  );
}

export async function learnAI(platform: PlatformId, before: string, after: string, rules: BrandRule[]) {
  const key = getGroqKey();
  if (key) return learnRule(platform, before, after, rules, key);
  const r = await viaServer<{ rule: Awaited<ReturnType<typeof learnRule>> }>({ action: "learn", platform, before, after, rules });
  return r.rule;
}

export function rerankAI(clips: ClipRef[], learnings: Learning[]) {
  const key = getGroqKey();
  return (
    key ? rerankClips(clips, learnings, key) : viaServer<Awaited<ReturnType<typeof rerankClips>>>({ action: "rerank", clips, learnings })
  ).catch(friendly);
}

export async function planAI(clips: ClipRef[], days: string[], taken: { date: string; time: string; title: string }[], learnings: Learning[], perDay: number) {
  const key = getGroqKey();
  try {
    if (key) return await planSchedule(clips, days, taken, learnings, perDay, key);
    const r = await viaServer<{ plan: PlanItem[] }>({ action: "plan", clips, days, taken, learnings, perDay });
    return r.plan;
  } catch (err) {
    return friendly(err);
  }
}
