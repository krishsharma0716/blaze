/**
 * Offline check of the iMessage agent's replies, with an in-memory store instead of SpacetimeDB.
 * Connected to lib/core/agentReply.ts. Run: npx tsx scripts/agent-sim.ts "350 5th Ave, Manhattan" "how tall is it" "on scene"
 * Calls the same live data sources as the agent. Nothing is written to SpacetimeDB or disk.
 */
import { replyTo, type AgentStore } from "../lib/core/agentReply";
import type { Tag } from "../lib/core/tags";

const incidents = new Map<bigint, { title: string; tags: Tag[] }>();
const active = new Map<string, bigint>();
let nextId = BigInt(1);

const store: AgentStore = {
  async activeIncident(conversationId) {
    const id = active.get(conversationId);
    const incident = id == null ? undefined : incidents.get(id);
    return id == null || !incident ? null : { id, ...incident };
  },
  async openIncident({ title }) {
    const id = nextId++;
    incidents.set(id, { title, tags: [] });
    console.log(`  [store] open_incident #${id} ${title}`);
    return id;
  },
  async saveBrief(incidentId, tags) {
    const incident = incidents.get(incidentId);
    if (incident) incident.tags = tags;
    console.log(`  [store] save_brief #${incidentId} (${tags.length} tags)`);
  },
  async setActiveIncident(conversationId, incidentId) {
    active.set(conversationId, incidentId);
    console.log(`  [store] set_active_incident ${conversationId} -> #${incidentId}`);
  },
  async setCrewStatus(incidentId, sender, status) {
    console.log(`  [store] set_crew_status #${incidentId} ${sender} ${status}`);
  },
};

async function main() {
  for (const text of process.argv.slice(2)) {
    console.log(`\n> ${text}`);
    const reply = await replyTo(text, "chat-sim", "crew member 1", store);
    if (!reply) {
      console.log("[quiet]");
      continue;
    }
    console.log(`[${reply.kind}]\n${reply.text}`);
    if (reply.voiceScript) console.log(`  (voice note: ${reply.voiceScript.length} chars)`);
  }
}

void main();
