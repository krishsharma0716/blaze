/**
 * SpacetimeDB module: the shared incident board.
 * The website and the iMessage agent write rows only through these reducers.
 * Published to Maincloud; it does not call Grok or the fire APIs.
 */
import { schema, table, t } from "spacetimedb/server";

const spacetimedb = schema({
  incident: table(
    { public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      kind: t.string(),
      title: t.string(),
      lat: t.f64(),
      lon: t.f64(),
      createdAt: t.timestamp(),
      source: t.string(),
    },
  ),
  brief: table(
    { public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      incidentId: t.u64(),
      tags: t.string(),
      summary: t.string(),
      script: t.string(),
    },
  ),
  message: table(
    { public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      conversationId: t.string(),
      incidentId: t.u64(),
      sender: t.string(),
      text: t.string(),
      direction: t.string(),
      createdAt: t.timestamp(),
    },
  ),
  conversation: table(
    { public: true },
    {
      id: t.string().primaryKey(),
      activeIncidentId: t.u64(),
    },
  ),
  crewStatus: table(
    { public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      incidentId: t.u64(),
      sender: t.string(),
      status: t.string(),
      updatedAt: t.timestamp(),
    },
  ),
});

export default spacetimedb;

export const openIncident = spacetimedb.reducer(
  {
    title: t.string(),
    kind: t.string(),
    lat: t.f64(),
    lon: t.f64(),
    source: t.string(),
  },
  (ctx, { title, kind, lat, lon, source }) => {
    ctx.db.incident.insert({
      id: 0n,
      kind,
      title,
      lat,
      lon,
      createdAt: ctx.timestamp,
      source,
    });
  },
);

export const saveBrief = spacetimedb.reducer(
  {
    incidentId: t.u64(),
    tags: t.string(),
    summary: t.string(),
    script: t.string(),
  },
  (ctx, { incidentId, tags, summary, script }) => {
    ctx.db.brief.insert({ id: 0n, incidentId, tags, summary, script });
  },
);

export const logMessage = spacetimedb.reducer(
  {
    conversationId: t.string(),
    incidentId: t.u64(),
    sender: t.string(),
    text: t.string(),
    direction: t.string(),
  },
  (ctx, { conversationId, incidentId, sender, text, direction }) => {
    ctx.db.message.insert({
      id: 0n,
      conversationId,
      incidentId,
      sender,
      text,
      direction,
      createdAt: ctx.timestamp,
    });
  },
);

export const setActiveIncident = spacetimedb.reducer(
  { conversationId: t.string(), incidentId: t.u64() },
  (ctx, { conversationId, incidentId }) => {
    const existing = ctx.db.conversation.id.find(conversationId);
    if (existing) {
      ctx.db.conversation.id.update({ ...existing, activeIncidentId: incidentId });
      return;
    }
    ctx.db.conversation.insert({ id: conversationId, activeIncidentId: incidentId });
  },
);

export const setCrewStatus = spacetimedb.reducer(
  { incidentId: t.u64(), sender: t.string(), status: t.string() },
  (ctx, { incidentId, sender, status }) => {
    ctx.db.crewStatus.insert({
      id: 0n,
      incidentId,
      sender,
      status,
      updatedAt: ctx.timestamp,
    });
  },
);
