/**
 * Placeholder until `spacetime generate` writes the real client bindings.
 * Connected to app/page.tsx. The generated file will subscribe to incident.
 * This copy does not talk to SpacetimeDB.
 */
import type { IncidentRow } from "../spacetime";

export function subscribeIncidents(
  _host: string,
  _database: string,
  _onRows: (rows: IncidentRow[]) => void,
): { disconnect: () => void } {
  throw new Error("Run spacetime generate before expecting a live board.");
}
