"use client";

import { useSyncExternalStore } from "react";

/**
 * A tiny localStorage-backed list store with cross-tab sync. Creator-level data (brand rules,
 * learnings, the calendar) lives here because it spans projects and belongs to this browser.
 */
export function createListStore<T>(key: string) {
  const listeners = new Set<() => void>();
  const EMPTY: T[] = [];
  let cache: { raw: string | null; items: T[] } = { raw: null, items: EMPTY };

  function read(): T[] {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {}
    if (raw !== cache.raw) {
      try {
        cache = { raw, items: raw ? (JSON.parse(raw) as T[]) : EMPTY };
      } catch {
        cache = { raw, items: EMPTY };
      }
    }
    return cache.items;
  }

  function write(items: T[]) {
    try {
      localStorage.setItem(key, JSON.stringify(items));
    } catch {}
    listeners.forEach((l) => l());
  }

  function subscribe(cb: () => void) {
    listeners.add(cb);
    const onStorage = (e: StorageEvent) => e.key === key && cb();
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(cb);
      window.removeEventListener("storage", onStorage);
    };
  }

  return {
    read,
    write,
    use: () => useSyncExternalStore(subscribe, read, () => EMPTY),
  };
}
