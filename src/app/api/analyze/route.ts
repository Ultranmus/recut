import { runAnalysis } from "@/lib/analysis";
import type { BrandRule, Learning } from "@/lib/brand-rules";
import type { Transcript } from "@/lib/types";

// Finds clips and writes per-platform captions with the server's env key.
export async function POST(request: Request) {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return Response.json({ error: "No server Groq key configured. Add one in Settings." }, { status: 400 });
  }

  const { transcript, name, rules, learnings } = (await request.json()) as {
    transcript?: Transcript;
    name?: string;
    rules?: BrandRule[];
    learnings?: Learning[];
  };
  if (!transcript?.segments?.length) return Response.json({ error: "Transcript is empty." }, { status: 400 });

  try {
    return Response.json(await runAnalysis(transcript, name ?? "episode", key, undefined, (rules ?? []).slice(0, 50), (learnings ?? []).slice(-20)));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Analysis failed." }, { status: 502 });
  }
}
