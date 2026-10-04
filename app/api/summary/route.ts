/**
 * National totals for the counters card: active fires, acres burned, CO2 estimate, species recorded in these areas.
 * Connected to listActiveFires, LANDFIRE (one vegetation sample per fire), and GBIF species facets.
 * Called when the map opens: totals first, then ?part=species. Each part is cached in memory for 10 minutes.
 */
import { listActiveFires } from "../../../lib/core/fires";
import { ringOf } from "../../../lib/core/geo";
import { co2Tonnes, evtCode, evtTable, fuelClass, speciesCounts } from "../../../lib/core/recovery";

async function pool<T, R>(items: T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await work(items[index]);
      }
    }),
  );
  return results;
}

const TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; body: Promise<unknown> }>();

export async function GET(request: Request) {
  const part = new URL(request.url).searchParams.get("part") === "species" ? "species" : "totals";
  const hit = cache.get(part);
  if (!hit || Date.now() - hit.at > TTL_MS) cache.set(part, { at: Date.now(), body: compute(part) });
  const entry = cache.get(part)!;
  try {
    const body = await entry.body;
    const failed = (body as { speciesFailed?: number }).speciesFailed ?? 0;
    if (failed > 10 && cache.get(part) === entry) cache.delete(part);
    return Response.json(body, { headers: { "Cache-Control": "public, max-age=0, s-maxage=600" } });
  } catch {
    if (cache.get(part) === entry) cache.delete(part);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}

async function compute(part: "species" | "totals") {
  const fires = await listActiveFires();
  if (part === "species") {
    const species = await pool(fires, 3, (fire) => speciesCounts(ringOf(fire.geometry), 3000).catch(() => null));
    const keys = new Set<string>();
    let speciesFailed = 0;
    for (const list of species) {
      if (!list) speciesFailed += 1;
      else for (const item of list) keys.add(item.key);
    }
    return { species: keys.size, speciesFailed };
  }
  const table = await evtTable();
  const carbon = await pool(fires, 8, async (fire) => {
    const code = table ? await evtCode(fire.centroid).catch(() => null) : null;
    const vegetation = code == null ? null : table?.get(code) ?? null;
    return co2Tonnes((fire.acres ?? 0) * 0.404686, fuelClass(vegetation));
  });
  return {
    fires: fires.length,
    acres: fires.reduce((sum, fire) => sum + (fire.acres ?? 0), 0),
    co2Tonnes: carbon.reduce((sum, tonnes) => sum + tonnes, 0),
  };
}
