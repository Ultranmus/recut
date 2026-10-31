"use client";

import { useEffect, useState } from "react";

let cached: Promise<boolean> | null = null;

/** Whether the deployment has a GROQ_API_KEY. `null` while loading. */
export function useServerKey() {
  const [value, setValue] = useState<boolean | null>(null);
  useEffect(() => {
    cached ??= fetch("/api/config")
      .then((r) => r.json())
      .then((d) => Boolean(d.serverKey))
      .catch(() => false);
    let live = true;
    cached.then((v) => live && setValue(v));
    return () => {
      live = false;
    };
  }, []);
  return value;
}
