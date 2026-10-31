"use client";

import type { BrandRule, Learning } from "./brand-rules";
import { createListStore } from "./local-store";

/** Brand Memory belongs to the creator, not a project, so it lives in this browser across all projects. */
const rulesStore = createListStore<BrandRule>("recut:brand-memory");
const learningsStore = createListStore<Learning>("recut:learnings");

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

/** Adds rules, skipping ones already saved. Returns the rules that were actually new. */
export function addRules(items: Omit<BrandRule, "id" | "createdAt">[]): BrandRule[] {
  const existing = rulesStore.read();
  const seen = new Set(existing.map((r) => norm(r.text)));
  const added: BrandRule[] = [];
  for (const item of items) {
    const n = norm(item.text);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    added.push({ ...item, id: crypto.randomUUID().slice(0, 8), createdAt: Date.now() });
  }
  if (added.length) rulesStore.write([...existing, ...added]);
  return added;
}

export const removeRule = (id: string) => rulesStore.write(rulesStore.read().filter((r) => r.id !== id));
export const getRules = rulesStore.read;
export const useBrandRules = rulesStore.use;

/** Saves performance feedback; a newer report on the same clip and platform replaces the old one. */
export function addLearnings(items: Omit<Learning, "id" | "createdAt">[]): Learning[] {
  const added = items.map((l) => ({ ...l, id: crypto.randomUUID().slice(0, 8), createdAt: Date.now() }));
  const kept = learningsStore
    .read()
    .filter((old) => !added.some((n) => n.projectId === old.projectId && n.clipId === old.clipId && n.platform === old.platform));
  if (added.length) learningsStore.write([...kept, ...added]);
  return added;
}

export const removeLearning = (id: string) => learningsStore.write(learningsStore.read().filter((l) => l.id !== id));
export const getLearnings = learningsStore.read;
export const useLearnings = learningsStore.use;
