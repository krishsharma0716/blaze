/**
 * Streams a Grok voice clip for a script. The browser calls this when play is pressed.
 * Connected to lib/core/speakBrief.ts and POST https://api.x.ai/v1/tts.
 * The API key stays here. The audio bytes are not written to disk.
 */
import { speakBrief } from "../../../lib/core/speakBrief";
import type { Tag } from "../../../lib/core/tags";

export async function POST(request: Request) {
  const body = (await request.json()) as { tags?: Tag[]; text?: string };
  const text = body.text?.trim() || speakBrief(body.tags ?? []);
  const key = process.env.XAI_API_KEY;
  if (!key) {
    return Response.json({ error: "unavailable" }, { status: 500 });
  }

  const upstream = await fetch("https://api.x.ai/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, voice_id: "eve", language: "en" }),
  });

  if (!upstream.ok || !upstream.body) {
    return Response.json({ error: "unavailable" }, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: { "Content-Type": "audio/mpeg" },
  });
}
