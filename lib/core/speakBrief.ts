/**
 * Turns tags into the short script that Grok will speak.
 * Connected to app/api/tts/route.ts and the iMessage agent.
 * It does not call the network and it does not write an audio file.
 */
import type { Tag } from "./tags";

export function speakBrief(tags: Tag[]): string {
  if (tags.length === 0) {
    return "No brief is stored yet.";
  }
  const lines = tags.map((tag) => `${tag.label}. ${tag.value}.`);
  return lines.join(" ");
}
