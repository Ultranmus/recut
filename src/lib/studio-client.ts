"use client";

import type { BrandRule, Learning } from "./brand-rules";
import { upcomingDates } from "./calendar";
import { getGroqKey } from "./settings";
import { learnRule, parseBrief, rerankClips, rewriteCaptions, type ClipRef, type RewriteInput } from "./studio-ai";
import type { PlatformId } from "./types";

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
  return key
    ? parseBrief(raw, clips, rules, dates, key)
    : viaServer<Awaited<ReturnType<typeof parseBrief>>>({ action: "brief", raw, clips, rules, dates });
}

export function rewriteAI(input: RewriteInput) {
  const key = getGroqKey();
  return key ? rewriteCaptions(input, key) : viaServer<Awaited<ReturnType<typeof rewriteCaptions>>>({ action: "rewrite", input });
}

export async function learnAI(platform: PlatformId, before: string, after: string, rules: BrandRule[]) {
  const key = getGroqKey();
  if (key) return learnRule(platform, before, after, rules, key);
  const r = await viaServer<{ rule: Awaited<ReturnType<typeof learnRule>> }>({ action: "learn", platform, before, after, rules });
  return r.rule;
}

export function rerankAI(clips: ClipRef[], learnings: Learning[]) {
  const key = getGroqKey();
  return key ? rerankClips(clips, learnings, key) : viaServer<Awaited<ReturnType<typeof rerankClips>>>({ action: "rerank", clips, learnings });
}
