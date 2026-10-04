/**
 * Opens the live SpacetimeDB subscription used by the incident board.
 * Connected to app/page.tsx and https://maincloud.spacetimedb.com.
 * Generated bindings replace the connect function after spacetime generate.
 */
export const SPACETIME_HOST =
  process.env.NEXT_PUBLIC_SPACETIMEDB_HOST ?? "https://maincloud.spacetimedb.com";

export const SPACETIME_DB = process.env.NEXT_PUBLIC_SPACETIMEDB_DB ?? "mhacks2026";

export type IncidentRow = {
  id: bigint;
  kind: string;
  title: string;
  lat: number;
  lon: number;
  source: string;
};
