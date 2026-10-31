import { connection } from "next/server";

// Tells the client whether a server-side Groq key exists. Never returns the key itself.
export async function GET() {
  await connection();
  return Response.json({ serverKey: Boolean(process.env.GROQ_API_KEY) });
}
