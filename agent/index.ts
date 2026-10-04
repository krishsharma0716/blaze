/**
 * Long-lived Spectrum process. Run it on this Mac with npm run agent.
 * Connected to Photon cloud iMessage and the open_incident reducer.
 * Leave this terminal open during judging. It is not a Next.js route.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { promisify } from "node:util";
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";

const execFileAsync = promisify(execFile);
const localCli = `${homedir()}/.local/bin/spacetime`;
const spacetime = existsSync(localCli) ? localCli : "spacetime";

const projectId = process.env.SPECTRUM_PROJECT_ID;
const projectSecret = process.env.SPECTRUM_PROJECT_SECRET;
const database = process.env.SPACETIMEDB_DB ?? "mhacks2026";

if (!projectId || !projectSecret) {
  console.error("Set SPECTRUM_PROJECT_ID and SPECTRUM_PROJECT_SECRET.");
  process.exit(1);
}

async function recordText(sender: string, text: string) {
  await execFileAsync(spacetime, [
    "call",
    "-s",
    "maincloud",
    database,
    "open_incident",
    text.slice(0, 120),
    "address",
    "0",
    "0",
    sender || "imessage",
  ]);
}

const app = await Spectrum({
  projectId,
  projectSecret,
  providers: [imessage.config()],
});

console.log("Spectrum agent listening. This Mac must stay awake.");

for await (const [space, message] of app.messages) {
  if (message.direction !== "inbound" || message.content.type !== "text") continue;
  const text = message.content.text;
  try {
    await recordText(message.sender?.id ?? "imessage", text);
  } catch (error) {
    console.error("SpacetimeDB write failed", error);
  }
  await space.send(`Received: ${text}`);
}
