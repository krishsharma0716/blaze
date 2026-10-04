/**
 * SpacetimeDB store for the iMessage agent, using the SDK connection (not the CLI).
 * Connected to lib/core/agentReply.ts (AgentStore) and the mhacks2026 module's tables and reducers.
 * openIncident returns no id, so the new row is found in the subscribed cache by title and source.
 */
import type { ActiveIncident, AgentStore } from "../lib/core/agentReply";
import { DbConnection } from "../lib/module_bindings";
import { SPACETIME_DB, SPACETIME_HOST } from "../lib/spacetime";
import type { Tag } from "../lib/core/tags";

export type SpacetimeStore = AgentStore & {
  logMessage(conversationId: string, incidentId: bigint | null, sender: string, text: string, direction: "in" | "out"): Promise<void>;
};

export function connectStore(): Promise<SpacetimeStore> {
  return new Promise((resolve, reject) => {
    const connection = DbConnection.builder()
      .withUri(SPACETIME_HOST)
      .withDatabaseName(SPACETIME_DB)
      .onConnect((ctx) => {
        ctx
          .subscriptionBuilder()
          .onApplied(() => resolve(storeFor(connection)))
          .onError((ctx) => reject(ctx.event ?? new Error("SpacetimeDB subscription failed")))
          .subscribe([
            "SELECT * FROM incident",
            "SELECT * FROM brief",
            "SELECT * FROM conversation",
            "SELECT * FROM crew_status",
          ]);
      })
      .onConnectError((_ctx, error) => reject(error))
      .build();
  });
}

function storeFor(conn: DbConnection): SpacetimeStore {
  const db = conn.db;

  async function waitForIncident(title: string, source: string, after: bigint): Promise<bigint | null> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      let found: bigint | null = null;
      for (const row of db.incident.iter()) {
        if (row.id > after && row.title === title && row.source === source && (found == null || row.id > found)) found = row.id;
      }
      if (found != null) return found;
      await new Promise((done) => setTimeout(done, 100));
    }
    return null;
  }

  return {
    async activeIncident(conversationId): Promise<ActiveIncident | null> {
      const conversation = db.conversation.id.find(conversationId);
      if (!conversation) return null;
      const incident = db.incident.id.find(conversation.activeIncidentId);
      if (!incident) return null;
      let latest: { id: bigint; tags: string } | null = null;
      for (const row of db.brief.iter()) {
        if (row.incidentId === incident.id && (!latest || row.id > latest.id)) latest = row;
      }
      let tags: Tag[] = [];
      try {
        tags = latest ? (JSON.parse(latest.tags) as Tag[]) : [];
      } catch {
        tags = [];
      }
      return { id: incident.id, title: incident.title, tags };
    },

    async openIncident({ title, kind, lat, lon, source }) {
      let before = BigInt(0);
      for (const row of db.incident.iter()) if (row.id > before) before = row.id;
      const trimmed = title.slice(0, 160);
      await conn.reducers.openIncident({ title: trimmed, kind, lat, lon, source });
      return waitForIncident(trimmed, source, before);
    },

    async saveBrief(incidentId, tags, summary, script) {
      await conn.reducers.saveBrief({ incidentId, tags: JSON.stringify(tags), summary: summary.slice(0, 2000), script: script.slice(0, 2000) });
    },

    async setActiveIncident(conversationId, incidentId) {
      await conn.reducers.setActiveIncident({ conversationId, incidentId });
    },

    async setCrewStatus(incidentId, sender, status) {
      await conn.reducers.setCrewStatus({ incidentId, sender, status });
    },

    async logMessage(conversationId, incidentId, sender, text, direction) {
      await conn.reducers.logMessage({ conversationId, incidentId: incidentId ?? BigInt(0), sender, text: text.slice(0, 1000), direction });
    },
  };
}
