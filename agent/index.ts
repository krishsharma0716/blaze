/**
 * Long-lived Photon iMessage agent. Run it on this Mac with npm run agent and leave the terminal open.
 * Connected to lib/core/agentReply.ts for replies and agent/store.ts for SpacetimeDB writes over the SDK.
 * Phone numbers are never stored: chats become hashed ids and senders become "crew member N". Audio stays in memory.
 */
import { createHash } from "node:crypto";
import { Spectrum, attachment, voice } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { replyTo } from "../lib/core/agentReply";
import { grokSpeech } from "../lib/core/grok";
import { connectStore } from "./store";

const projectId = process.env.SPECTRUM_PROJECT_ID ?? "";
const projectSecret = process.env.SPECTRUM_PROJECT_SECRET ?? "";

if (!projectId || !projectSecret) {
  console.error("Set SPECTRUM_PROJECT_ID and SPECTRUM_PROJECT_SECRET in .env.local.");
  process.exit(1);
}
if (!process.env.XAI_API_KEY) console.warn("XAI_API_KEY is not set. Replies will be text only, without voice notes.");

const crewLabels = new Map<string, string>();

function crewLabel(senderId: string): string {
  const existing = crewLabels.get(senderId);
  if (existing) return existing;
  const label = `crew member ${crewLabels.size + 1}`;
  crewLabels.set(senderId, label);
  return label;
}

function chatId(spaceId: string): string {
  return `chat-${createHash("sha256").update(spaceId).digest("hex").slice(0, 10)}`;
}

async function main() {
  const store = await connectStore();
  console.log("Connected to SpacetimeDB.");

  const app = await Spectrum({
    projectId,
    projectSecret,
    providers: [imessage.config()],
  });

  console.log("Spectrum agent listening. This Mac must stay awake.");

  for await (const [space, message] of app.messages) {
    if (message.direction !== "inbound" || message.content.type !== "text") continue;
    const text = message.content.text;
    const conversationId = chatId(space.id);
    const sender = crewLabel(message.sender?.id ?? "imessage");

    try {
      const before = await store.activeIncident(conversationId);
      await store.logMessage(conversationId, before?.id ?? null, sender, text, "in").catch(() => undefined);

      const group = Number((space as { memberCount?: number }).memberCount ?? (space as { members?: unknown[] }).members?.length ?? 0) > 2;
      const reply = await replyTo(text, conversationId, sender, store, { group });
      if (!reply) continue;
      await space.send(reply.text);

      const after = await store.activeIncident(conversationId);
      await store.logMessage(conversationId, after?.id ?? null, "agent", reply.text, "out").catch(() => undefined);

      if (reply.voiceScript) {
        const audio = await grokSpeech(reply.voiceScript);
        if (!audio) console.error("Voice note skipped. XAI_API_KEY must be a console.x.ai key with credits.");
        else {
          await space
            .send(voice(audio, { mimeType: "audio/mpeg", name: "brief.mp3" }))
            .catch(() => space.send(attachment(audio, { mimeType: "audio/mpeg", name: "brief.mp3" })));
        }
      }
    } catch (error) {
      console.error("Reply failed", error);
      await space.send("Something went wrong on my side. Try again in a minute.").catch(() => undefined);
    }
  }
}

main().catch((error) => {
  console.error("Agent stopped", error);
  process.exit(1);
});
