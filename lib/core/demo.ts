/**
 * Optional offline answers for the Palisades fire and one NYC address when DEMO_MODE=1.
 * Connected to lib/core/fires.ts and lib/core/address.ts. Live APIs stay the default.
 * Fixtures live under fixtures/demo/. Nothing else is served from disk.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AddressBrief } from "./address";
import type { FireRecord } from "./fires";

export function demoMode(): boolean {
  return process.env.DEMO_MODE === "1";
}

function readJson<T>(name: string): T | null {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), "fixtures", "demo", name), "utf8")) as T;
  } catch {
    return null;
  }
}

export function demoPalisades(): FireRecord | null {
  if (!demoMode()) return null;
  return readJson<FireRecord>("palisades.json");
}

export function demoAddress(query: string): AddressBrief | { error: string } | null {
  if (!demoMode()) return null;
  const q = query.trim().toLowerCase();
  if (!q) return { error: "This brief covers New York City only." };
  if (/\b(los angeles|chicago|boston|seattle|houston|miami|london)\b/.test(q)) {
    return { error: "This brief covers New York City only." };
  }
  const saved = readJson<AddressBrief & { queries?: string[] }>("address.json");
  if (!saved) return null;
  const aliases = (saved.queries ?? []).map((item) => item.toLowerCase());
  const hit =
    aliases.some((alias) => q.includes(alias) || alias.includes(q)) ||
    /fifth|5th|empire|hoyt|manhattan|brooklyn|queens|bronx|nyc|new york/.test(q);
  if (!hit) return null;
  const { queries: _ignored, ...brief } = saved;
  return brief;
}
