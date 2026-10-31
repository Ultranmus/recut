import { GROQ_BASE, TRANSCRIBE_MODEL, groqError } from "@/lib/analysis";

const MAX_BYTES = 8 * 1024 * 1024;

// Proxies one audio chunk to Groq Whisper using the server's env key.
// Browsers with their own key call Groq directly and never hit this route.
export async function POST(request: Request) {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return Response.json({ error: "No server Groq key configured. Add one in Settings." }, { status: 400 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) return Response.json({ error: "Missing audio file." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Audio chunk too large." }, { status: 413 });

  const body = new FormData();
  body.append("file", file, file instanceof File && file.name ? file.name : "chunk.wav");
  body.append("model", TRANSCRIBE_MODEL);
  body.append("response_format", "verbose_json");
  body.append("timestamp_granularities[]", "word");
  body.append("timestamp_granularities[]", "segment");
  body.append("temperature", "0");
  const language = form.get("language");
  if (typeof language === "string" && language) body.append("language", language);

  const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body,
  });
  if (!res.ok) return Response.json({ error: await groqError(res) }, { status: res.status });
  return Response.json(await res.json());
}
