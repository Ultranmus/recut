"use client";

import { useSyncExternalStore } from "react";

/** The user's own Groq key lives only in this browser's localStorage. */
const KEY = "recut:groq-key";
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

export function setGroqKey(value: string | null) {
  try {
    if (value) localStorage.setItem(KEY, value.trim());
    else localStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useGroqKey() {
  return useSyncExternalStore(subscribe, read, () => null);
}

export function getGroqKey() {
  return read();
}

export function maskKey(key: string) {
  return key.length > 10 ? `${key.slice(0, 4)}••••••••${key.slice(-4)}` : "••••••••";
}
