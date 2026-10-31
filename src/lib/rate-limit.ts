/**
 * Per-visitor limits on the routes that spend the shared server Groq key, so one visitor
 * can't use up the free-tier quota for everyone. Counts live in the function instance's
 * memory: Fluid Compute reuses instances, so this is a best-effort guard, not a hard cap.
 * Visitors with their own key call Groq from the browser and never count here.
 */
const WINDOW_MS = 10 * 60_000;

const LIMITS = {
  // One upload sends a 2-minute chunk per request, so 60 covers about two hours of audio.
  transcribe: 60,
  analyze: 8,
  // A voice brief makes 2-3 calls, and caption edits add one "learn" call each.
  studio: 60,
} as const;

export type LimitedRoute = keyof typeof LIMITS;

const hits = new Map<string, number[]>();
let lastSweep = Date.now();

function visitor(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}

function sweep(now: number) {
  if (now - lastSweep < WINDOW_MS) return;
  lastSweep = now;
  for (const [id, times] of hits) if (!times.some((t) => now - t < WINDOW_MS)) hits.delete(id);
}

/** Returns a 429 response when the visitor is over the limit for this route, otherwise null. */
export function sharedKeyLimit(request: Request, route: LimitedRoute): Response | null {
  const now = Date.now();
  sweep(now);
  const id = `${route}:${visitor(request)}`;
  const recent = (hits.get(id) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMITS[route]) {
    hits.set(id, recent);
    const minutes = Math.max(1, Math.ceil((recent[0] + WINDOW_MS - now) / 60_000));
    return Response.json(
      {
        error: `You've hit this demo's limit on the shared Groq key. Add your own free key in Settings to keep going, or try again in ${minutes} min.`,
        code: "shared_limit",
      },
      { status: 429 }
    );
  }
  recent.push(now);
  hits.set(id, recent);
  return null;
}

/** Adds the "use your own key" hint to Groq quota errors raised while using the shared key. */
export function sharedKeyError(err: unknown, fallback: string) {
  const msg = err instanceof Error ? err.message : fallback;
  return /busy|rate limit/i.test(msg) ? `${msg} The shared demo key is busy; add your own free Groq key in Settings to skip the queue.` : msg;
}
