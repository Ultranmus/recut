import type { BrandRule, Learning } from "@/lib/brand-rules";
import { learnRule, parseBrief, planSchedule, rerankClips, rewriteCaptions, type ClipRef, type RewriteInput } from "@/lib/studio-ai";
import { sharedKeyError, sharedKeyLimit } from "@/lib/rate-limit";
import type { PlatformId } from "@/lib/types";

type Body =
  | { action: "brief"; raw: string; clips: ClipRef[]; rules: BrandRule[]; dates: string }
  | { action: "rewrite"; input: RewriteInput }
  | { action: "learn"; platform: PlatformId; before: string; after: string; rules: BrandRule[] }
  | { action: "rerank"; clips: ClipRef[]; learnings: Learning[] }
  | { action: "plan"; clips: ClipRef[]; days: string[]; taken: { date: string; time: string; title: string }[]; learnings: Learning[]; perDay: number };

// Runs the Talk-to-your-studio tasks with the server's env key. Prompts are built server-side.
export async function POST(request: Request) {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return Response.json({ error: "No server Groq key configured. Add one in Settings." }, { status: 400 });
  }
  const limited = sharedKeyLimit(request, "studio");
  if (limited) return limited;

  const body = (await request.json()) as Body;
  try {
    switch (body.action) {
      case "brief":
        return Response.json(
          await parseBrief(String(body.raw ?? ""), body.clips ?? [], body.rules ?? [], String(body.dates ?? ""), key)
        );
      case "rewrite":
        return Response.json(await rewriteCaptions(body.input, key));
      case "learn":
        return Response.json({ rule: await learnRule(body.platform, body.before, body.after, body.rules ?? [], key) });
      case "rerank":
        return Response.json(await rerankClips(body.clips ?? [], (body.learnings ?? []).slice(-20), key));
      case "plan":
        return Response.json({
          plan: await planSchedule(
            (body.clips ?? []).slice(0, 12),
            (body.days ?? []).slice(0, 21),
            (body.taken ?? []).slice(0, 40),
            (body.learnings ?? []).slice(-20),
            Math.max(1, Math.min(3, Number(body.perDay) || 1)),
            key
          ),
        });
      default:
        return Response.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (err) {
    return Response.json({ error: sharedKeyError(err, "Request failed.") }, { status: 502 });
  }
}
