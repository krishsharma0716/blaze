/**
 * Web entry for the same Photon agent used on iMessage: NYC building brief or wildfire dashboard brief.
 * Connected to lib/core/agentReply.ts. Uses an in-memory store so follow-ups work in this process.
 * POST { text, conversationId? }. Does not write to SpacetimeDB.
 */
import { replyTo, type AgentStore } from "../../../lib/core/agentReply";
import type { Tag } from "../../../lib/core/tags";

type MemoryIncident = { title: string; tags: Tag[] };

const incidents = new Map<bigint, MemoryIncident>();
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
    return id;
  },
  async saveBrief(incidentId, tags) {
    const incident = incidents.get(incidentId);
    if (incident) incident.tags = tags;
  },
  async setActiveIncident(conversationId, incidentId) {
    active.set(conversationId, incidentId);
  },
  async setCrewStatus() {},
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { text?: string; conversationId?: string } | null;
  const text = body?.text?.trim() ?? "";
  if (!text) return Response.json({ error: "unavailable" }, { status: 400 });
  try {
    const reply = await replyTo(text, body?.conversationId?.trim() || "web", "web", store);
    if (!reply) return Response.json({ kind: "quiet", text: "" });
    return Response.json(reply);
  } catch {
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
