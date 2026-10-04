/**
 * Carbon estimate, animals recorded here (with photos), habitat overlap, and vegetation for one fire.
 * Connected to app/api/fire-detail, app/api/summary, GBIF, iNaturalist, USFWS, and LANDFIRE.
 * Species counts are GBIF records inside the perimeter. Photos are iNaturalist taxon photos.
 */
import { convexHull, counterClockwise, ringOf, simplifyRing, type LngLat } from "./geo";
import type { FireRecord } from "./fires";
import type { Tag } from "./tags";

export type Species = {
  key: string;
  name: string;
  scientific: string | null;
  count: number;
  photo: string | null;
  credit: string | null;
  link: string | null;
};

export type Recovery = {
  tags: Tag[];
  species: Species[];
  speciesTotal: number;
  habitat: string[];
  vegetation: string;
  fuel: FuelKind;
  co2Now: number | null;
};

export type FuelKind = "forest" | "shrub" | "grass";

export const FUEL: Record<FuelKind, { load: number; fraction: number }> = {
  forest: { load: 50, fraction: 0.4 },
  shrub: { load: 15, fraction: 0.7 },
  grass: { load: 3, fraction: 0.9 },
};

async function grab(url: string, ms = 4000): Promise<Response | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(ms), cache: "no-store" });
    return response.ok ? response : null;
  } catch {
    return null;
  }
}

export function fuelClass(vegetation: Vegetation | null): FuelKind {
  if (!vegetation) return "shrub";
  if (/^tree/i.test(vegetation.lifeform)) return "forest";
  if (/^shrub/i.test(vegetation.lifeform)) return "shrub";
  if (/^herb/i.test(vegetation.lifeform)) return "grass";
  const name = vegetation.name;
  if (/grass|herb|meadow/i.test(name)) return "grass";
  if (/shrub|chaparral|scrub/i.test(name)) return "shrub";
  if (/forest|wood|pine|fir|oak|timber|conifer/i.test(name)) return "forest";
  return "shrub";
}

export function co2Tonnes(hectares: number, kind: FuelKind): number {
  const fuel = FUEL[kind];
  return hectares * fuel.load * fuel.fraction * 1.6;
}

function wkt(ring: LngLat[]): string {
  const slim = counterClockwise(simplifyRing(ring, 12));
  const closed = slim[0][0] === slim[slim.length - 1][0] && slim[0][1] === slim[slim.length - 1][1] ? slim : [...slim, slim[0]];
  return `POLYGON((${closed.map(([lon, lat]) => `${lon} ${lat}`).join(",")}))`;
}

function facetUrl(ring: LngLat[], limit: number): string {
  const url = new URL("https://api.gbif.org/v1/occurrence/search");
  url.searchParams.set("geometry", wkt(ring));
  url.searchParams.set("kingdomKey", "1");
  url.searchParams.set("facet", "speciesKey");
  url.searchParams.set("facetLimit", String(limit));
  url.searchParams.set("limit", "0");
  return url.toString();
}

export async function speciesCounts(ring: LngLat[], limit = 3000): Promise<{ key: string; count: number }[] | null> {
  if (ring.length < 3) return [];
  let shape = ring;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(facetUrl(shape, limit), { signal: AbortSignal.timeout(8000), cache: "no-store" });
    } catch {
      return null;
    }
    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
      continue;
    }
    if (response.status === 400 && shape === ring) {
      shape = convexHull(ring);
      continue;
    }
    if (!response.ok) return null;
    const body = (await response.json()) as { facets?: { counts?: { name: string; count: number }[] }[] };
    return (body.facets?.[0]?.counts ?? []).map((item) => ({ key: item.name, count: item.count }));
  }
  return null;
}

async function describe(key: string, count: number): Promise<Species> {
  const lookup = await grab(`https://api.gbif.org/v1/species/${key}`, 2500);
  const gbif = lookup ? ((await lookup.json()) as { vernacularName?: string; canonicalName?: string }) : {};
  const scientific = gbif.canonicalName ?? null;
  let common: string | null = gbif.vernacularName ?? null;
  let photo: string | null = null;
  let credit: string | null = null;
  let link: string | null = null;
  if (scientific) {
    const inat = await grab(
      `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(scientific)}&rank=species&per_page=1`,
      3000,
    );
    const taxon = inat
      ? ((await inat.json()) as {
          results?: {
            id?: number;
            name?: string;
            preferred_common_name?: string;
            default_photo?: { medium_url?: string; attribution?: string };
          }[];
        }).results?.[0]
      : undefined;
    if (taxon && taxon.name?.toLowerCase() === scientific.toLowerCase()) {
      common = taxon.preferred_common_name ?? common;
      photo = taxon.default_photo?.medium_url ?? null;
      credit = taxon.default_photo?.attribution ?? null;
      link = taxon.id ? `https://www.inaturalist.org/taxa/${taxon.id}` : null;
    }
  }
  return {
    key,
    name: common ? common.replace(/(^|[\s-])\w/g, (letter) => letter.toUpperCase()) : scientific ?? "name unavailable",
    scientific,
    count,
    photo,
    credit,
    link,
  };
}

async function speciesIn(ring: LngLat[]): Promise<{ species: Species[]; total: number }> {
  const counts = await speciesCounts(ring);
  if (!counts) return { species: [], total: 0 };
  const species = await Promise.all(counts.slice(0, 8).map((item) => describe(item.key, item.count)));
  return { species, total: counts.length };
}

async function habitatIn(ring: LngLat[]): Promise<string[]> {
  let west = 180;
  let south = 90;
  let east = -180;
  let north = -90;
  for (const [lon, lat] of ring) {
    west = Math.min(west, lon);
    south = Math.min(south, lat);
    east = Math.max(east, lon);
    north = Math.max(north, lat);
  }
  const url = new URL("https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services/USFWS_Critical_Habitat/FeatureServer/0/query");
  url.searchParams.set("geometry", JSON.stringify({ xmin: west, ymin: south, xmax: east, ymax: north, spatialReference: { wkid: 4326 } }));
  url.searchParams.set("geometryType", "esriGeometryEnvelope");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("outFields", "comname,sciname");
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("resultRecordCount", "20");
  url.searchParams.set("f", "json");
  const response = await grab(url.toString());
  if (!response) return [];
  const body = (await response.json()) as { features?: { attributes?: { comname?: string; sciname?: string } }[] };
  const names = new Set<string>();
  for (const feature of body.features ?? []) {
    const name = feature.attributes?.comname || feature.attributes?.sciname;
    if (name) names.add(name);
  }
  return [...names].slice(0, 6);
}

export type Vegetation = { name: string; lifeform: string };

type EvtRow = { Value?: number; EVT_NAME?: string; EVT_LF?: string };

const LANDFIRE = "https://lfps.usgs.gov/arcgis/rest/services/Landfire_LF2024/LF2024_EVT_CONUS/ImageServer";

export async function evtCode([lon, lat]: LngLat): Promise<number | null> {
  const point = JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } });
  const response = await grab(
    `${LANDFIRE}/identify?geometry=${encodeURIComponent(point)}&geometryType=esriGeometryPoint&returnCatalogItems=false&f=json`,
    4000,
  );
  if (!response) return null;
  const code = Number(((await response.json()) as { value?: string }).value);
  return Number.isFinite(code) && code >= 0 ? code : null;
}

export async function evtTable(): Promise<Map<number, Vegetation> | null> {
  const rule = JSON.stringify({ rasterFunction: "LF2024_EVT_CONUS" });
  const response = await grab(`${LANDFIRE}/rasterAttributeTable?renderingRule=${encodeURIComponent(rule)}&f=json`, 8000);
  if (!response) return null;
  const body = (await response.json()) as { features?: { attributes?: EvtRow }[] };
  const table = new Map<number, Vegetation>();
  for (const feature of body.features ?? []) {
    const row = feature.attributes;
    if (row?.Value == null || !row.EVT_NAME || /nodata/i.test(row.EVT_NAME)) continue;
    table.set(row.Value, { name: row.EVT_NAME, lifeform: row.EVT_LF ?? "" });
  }
  return table;
}

export async function vegetationAt(fire: FireRecord): Promise<Vegetation | null> {
  const ring = ringOf(fire.geometry);
  const [cx, cy] = fire.centroid;
  const samples: LngLat[] = [fire.centroid];
  for (const share of [0, 0.25, 0.5, 0.75]) {
    const edge = ring[Math.floor(share * ring.length)];
    if (edge) samples.push([(cx + edge[0]) / 2, (cy + edge[1]) / 2]);
  }
  const [codes, table] = await Promise.all([
    Promise.all(samples.map((point) => evtCode(point).catch(() => null))),
    evtTable(),
  ]);
  if (!table) return null;
  const rows = codes.map((code) => (code == null ? undefined : table.get(code))).filter((row): row is Vegetation => Boolean(row));
  const natural = rows.filter((row) => /^(tree|shrub|herb)/i.test(row.lifeform));
  const pool = natural.length > 0 ? natural : rows;
  if (pool.length === 0) return null;
  const tally = new Map<string, { row: Vegetation; count: number }>();
  for (const row of pool) tally.set(row.name, { row, count: (tally.get(row.name)?.count ?? 0) + 1 });
  return [...tally.values()].sort((a, b) => b.count - a.count)[0].row;
}

export function fuelNote(vegetation: Vegetation | null): string {
  if (vegetation == null) {
    return "Vegetation only, structures excluded. Vegetation sample failed, so shrub defaults were used: 15 t/ha, 0.7 burned, 1.6 t CO2 per tonne. Estimate.";
  }
  const kind = fuelClass(vegetation);
  const fuel = FUEL[kind];
  return `Vegetation only, structures excluded. ${kind} defaults: ${fuel.load} t/ha, fraction ${fuel.fraction}, 1.6 t CO2 per tonne of dry fuel. Estimate.`;
}

export async function getRecovery(fire: FireRecord): Promise<Recovery> {
  const ring = ringOf(fire.geometry);
  const [animals, habitat, vegetation] = await Promise.all([
    speciesIn(ring).catch(() => ({ species: [], total: 0 })),
    habitatIn(ring).catch(() => []),
    vegetationAt(fire).catch(() => null),
  ]);
  const burnedHa = fire.acres == null ? null : fire.acres * 0.404686;
  const now = burnedHa == null ? null : co2Tonnes(burnedHa, fuelClass(vegetation));
  return {
    species: animals.species,
    speciesTotal: animals.total,
    habitat,
    vegetation: vegetation?.name ?? "unavailable",
    fuel: fuelClass(vegetation),
    co2Now: now,
    tags: [
      { label: "CO2 now", value: now == null ? "unavailable" : `${Math.round(now).toLocaleString()} t`, detail: fuelNote(vegetation) },
      {
        label: "Vegetation mapped here",
        value: vegetation?.name ?? "unavailable",
        detail: `LANDFIRE 2024 existing vegetation, most common natural type at five points inside the perimeter${vegetation?.lifeform ? `, life form ${vegetation.lifeform.toLowerCase()}` : ""}. Not a stem map.`,
      },
    ],
  };
}