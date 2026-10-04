/**
 * Streams a Grok Voice clip (text-to-speech, voice eve). The crew brief Play button calls this.
 * Connected to lib/core/grok.ts and POST https://api.x.ai/v1/tts. Accepts { text } or { tags }.
 * The API key stays here. The audio bytes are not written to disk.
 */
import { grokSpeech } from "../../../lib/core/grok";
import { speakBrief } from "../../../lib/core/speakBrief";
import type { Tag } from "../../../lib/core/tags";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { text?: string; tags?: Tag[] } | null;
  const tags = (body?.tags ?? []).slice(0, 12).filter((tag) => tag.label && tag.value);
  const text = (body?.text?.trim() || (tags.length ? speakBrief(tags) : "")).slice(0, 1200);
  if (!text) return Response.json({ error: "unavailable" }, { status: 400 });
  const audio = await grokSpeech(text);
  if (!audio) return Response.json({ error: "unavailable" }, { status: 502 });
  return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/mpeg" } });
}
