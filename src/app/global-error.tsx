"use client";

import { useEffect } from "react";

// Replaces the root layout when it crashes, so it can't rely on globals.css; styles are inline.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 16,
          background: "#0a0a0c",
          color: "#f5f5f7",
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
        }}
      >
        <title>Something went wrong · Recut</title>
        <div
          style={{
            maxWidth: 420,
            textAlign: "center",
            padding: 32,
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(30,30,34,0.7)",
          }}
        >
          <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: "#ff453a" }}>
            Something broke
          </p>
          <h1 style={{ margin: "8px 0 0", fontSize: 24, fontWeight: 600 }}>Recut couldn&apos;t load</h1>
          <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.6, color: "#a1a1aa" }}>
            Your projects are saved in this browser, so nothing is lost. Reload to try again.
          </p>
          <div style={{ marginTop: 24, display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              onClick={() => retry()}
              style={{ height: 36, padding: "0 16px", borderRadius: 10, border: 0, background: "#0a84ff", color: "white", fontSize: 14, cursor: "pointer" }}
            >
              Try again
            </button>
            <button
              // The root layout itself crashed, so a full page load is the reliable way out.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              onClick={() => window.location.assign("/")}
              style={{ height: 36, padding: "0 16px", borderRadius: 10, border: 0, background: "rgba(255,255,255,0.1)", color: "#f5f5f7", fontSize: 14, cursor: "pointer" }}
            >
              Go home
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
