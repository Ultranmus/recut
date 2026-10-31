"use client";

import { useEffect, useState } from "react";

/**
 * Tells the creator when the connection drops (and when it's back), and registers the service
 * worker that keeps the app shell and the demo opening offline.
 */
export function ConnectionBanner() {
  const [state, setState] = useState<"online" | "offline" | "back">("online");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const offline = () => {
      clearTimeout(timer);
      setState("offline");
    };
    const online = () => {
      setState((s) => (s === "offline" ? "back" : s));
      timer = setTimeout(() => setState("online"), 2500);
    };
    if (!navigator.onLine) offline();
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
    return () => {
      clearTimeout(timer);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);

  if (state === "online") return null;
  const off = state === "offline";
  return (
    <div
      role="status"
      aria-live="polite"
      className="rise fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex justify-center px-4"
    >
      <div className="window flex max-w-md items-center gap-3 rounded-full px-4 py-2 text-xs text-fg-2 sm:text-sm">
        <span className={`size-2 shrink-0 rounded-full ${off ? "bg-warning" : "bg-success"}`} />
        {off ? (
          <span>
            <span className="font-medium text-fg">You&apos;re offline.</span> Saved projects still open; uploads and AI
            need a connection.
          </span>
        ) : (
          <span className="font-medium text-fg">Back online.</span>
        )}
      </div>
    </div>
  );
}
