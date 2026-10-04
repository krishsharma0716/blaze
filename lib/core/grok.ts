/**
 * Server-side Grok calls: one short text answer (Responses API) and one voice clip (TTS, voice "eve").
 * Connected to lib/core/agentReply.ts and agent/index.ts. The key is read from XAI_API_KEY and never sent to a browser.
 * Both return null on any failure so callers can fall back to plain text. Audio stays in memory.
 */
const MODEL = "grok-4.7";

export function grokReady(): boolean {
  return Boolean(process.env.XAI_API_KEY);
}

export async function grokText(instructions: string, input: string): Promise<string | null> {
  const key = process.env.XAI_API_KEY;
  if (!key) return null;
  try {
    const response = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, instructions, input, temperature: 0, max_output_tokens: 300 }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      output_text?: string;
      output?: { type?: string; content?: { type?: string; text?: string }[] }[];
    };
    const text =
      body.output_text ??
      body.output
        ?.flatMap((item) => item.content ?? [])
        .filter((part) => part.type === "output_text" && part.text)
        .map((part) => part.text)
        .join("");
    return text?.trim() || null;
  } catch {
    return null;
  }
}

export async function grokSpeech(text: string): Promise<Buffer | null> {
  const key = process.env.XAI_API_KEY;
  if (!key || !text.trim()) return null;
  try {
    const response = await fetch("https://api.x.ai/v1/tts", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 1200), voice_id: "eve", language: "en" }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}
