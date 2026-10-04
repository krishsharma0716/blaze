/**
 * Carbon estimate, animals recorded, habitat overlap, vegetation, and help links.
 * Connected to app/api/fire-detail/route.ts, GBIF, USFWS, and LANDFIRE.
 * Species lines are labeled animals displaced. Counts are records inside the perimeter.
 */
import { areaHa, ringOf, simplifyRing, type LngLat } from "./geo";
import type { FireRecord } from "./fires";
import type { Tag } from "./tags";

export type HelpLink = { group: "Forests" | "People"; name: string; url: string; note: string };

export type Recovery = {
  tags: Tag[];
  species: { name: string; count: number }[];
  habitat: string[];
  vegetation: string;
  links: HelpLink[];
};

const FUEL = {
  forest: { load: 50, fraction: 0.4 },
  shrub: { load: 15, fraction: 0.7 },
  grass: { load: 3, fraction: 0.9 },
} as const;

async function grab(url: string, ms = 4000): Promise<Response | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(ms), cache: "no-store" });
    return response.ok ? response : null;
  } catch {
    return null;
  }
}

function fuelClass(name: string | null): keyof typeof FUEL {
  if (!name) return "shrub";
  if (/grass|herb|meadow/i.test(name)) return "grass";
  if (/shrub|chaparral|scrub/i.test(name)) return "shrub";
  if (/forest|wood|pine|fir|oak|timber|conifer/i.test(name)) return "forest";
  return "shrub";
}

function co2Tonnes(hectares: number, kind: keyof typeof FUEL): number {
  const fuel = FUEL[kind];
  return hectares * fuel.load * fuel.fraction * 1.6;
}

function wkt(ring: LngLat[]): string {
  const slim = simplifyRing(ring, 12);
  const closed = slim[0][0] === slim[slim.length - 1][0] && slim[0][1] === slim[slim.length - 1][1] ? slim : [...slim, slim[0]];
  return `POLYGON((${closed.map(([lon, lat]) => `${lon} ${lat}`).join(",")}))`;
}

async function speciesIn(ring: LngLat[]): Promise<{ name: string; count: number }[]> {
  const url = new URL("https://api.gbif.org/v1/occurrence/search");
  url.searchParams.set("geometry", wkt(ring));
  url.searchParams.set("kingdomKey", "1");
  url.searchParams.set("facet", "speciesKey");
  url.searchParams.set("facetLimit", "6");
  url.searchParams.set("limit", "0");
  const response = await grab(url.toString());
  if (!response) return [];
  const body = (await response.json()) as { facets?: { counts?: { name: string; count: number }[] }[] };
  const counts = body.facets?.[0]?.counts?.slice(0, 5) ?? [];
  const named = await Promise.all(
    counts.map(async (item) => {
      const lookup = await grab(`https://api.gbif.org/v1/species/${item.name}`, 2500);
      if (!lookup) return { name: "name unavailable", count: item.count };
      const species = (await lookup.json()) as { vernacularName?: string; canonicalName?: string };
      return { name: species.vernacularName || species.canonicalName || "name unavailable", count: item.count };
    }),
  );
  return named;
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

async function vegetationAt(lon: number, lat: number): Promise<string | null> {
  const url =
    "https://lfps.usgs.gov/arcgis/rest/services/Landfire_LF2024/LF2024_EVT_CONUS/ImageServer/identify" +
    `?geometry=${lon},${lat}&geometryType=esriGeometryPoint&f=json`;
  const response = await grab(url, 2500);
  if (!response) return null;
  const body = (await response.json()) as { value?: string; properties?: { EVT_Name?: string } };
  const name = body.properties?.EVT_Name ?? (body.value ? String(body.value) : null);
  if (!name || /nodata|no data/i.test(name)) return null;
  return name;
}

function helpLinks(lon: number, lat: number): HelpLink[] {
  const california = lon < -114 && lon > -125 && lat > 32 && lat < 42.2;
  const tahoe = lon < -119.7 && lon > -120.4 && lat > 38.6 && lat < 39.5;
  const southernCalifornia = california && lat < 35.8;
  const links: HelpLink[] = [
    { group: "Forests", name: "National Forest Foundation", url: "https://www.nationalforests.org/tree-planting-programs", note: "Reforestation on national forests. You cannot pick the fire." },
    { group: "Forests", name: "Forest Service Plant-a-Tree", url: "https://www.fs.usda.gov/working-with-us/donations", note: "The agency's seedling donations." },
    { group: "Forests", name: "American Forests", url: "https://www.americanforests.org/", note: "Large-scale restoration, including after fire." },
    { group: "People", name: "After the Fire USA", url: "https://afterthefireusa.org/", note: "Long-term community recovery, not tree planting." },
    { group: "People", name: "Red Cross wildfire relief", url: "https://www.redcross.org/about-us/our-work/disaster-relief/wildfire-relief.html", note: "Shelter and financial help right after the fire." },
  ];
  if (california) {
    links.splice(3, 0, { group: "Forests", name: "Penny Pines", url: "https://www.nationalforests.org/get-involved/penny-pines", note: "California only. About $68 toward an acre on a named national forest." });
  }
  if (tahoe) links.splice(3, 0, { group: "Forests", name: "Sugar Pine Foundation", url: "https://sugarpinefoundation.org/", note: "Tahoe burn scars." });
  if (southernCalifornia) links.splice(3, 0, { group: "Forests", name: "TreePeople", url: "https://www.treepeople.org/", note: "Southern California." });
  return links;
}

export async function getRecovery(fire: FireRecord, cone: LngLat[] | null): Promise<Recovery> {
  const ring = ringOf(fire.geometry);
  const [animals, habitat, vegetation] = await Promise.all([
    speciesIn(ring).catch(() => []),
    habitatIn(ring).catch(() => []),
    vegetationAt(fire.centroid[0], fire.centroid[1]).catch(() => null),
  ]);
  const kind = fuelClass(vegetation);
  const assumed = vegetation == null;
  const burnedHa = fire.acres == null ? null : fire.acres * 0.404686;
  const now = burnedHa == null ? null : co2Tonnes(burnedHa, kind);
  const projectedHa = cone && cone.length >= 3 ? areaHa(cone) : null;
  const projected = projectedHa == null ? null : co2Tonnes(projectedHa, kind);
  const fuel = FUEL[kind];
  const fuelNote = assumed
    ? "Vegetation sample failed, so shrub defaults were used: 15 t/ha, 0.7 burned, 1.6 t CO2 per tonne. Estimate."
    : `${kind} defaults: ${fuel.load} t/ha, fraction ${fuel.fraction}, 1.6 t CO2 per tonne of dry fuel. Estimate. Vegetation mapped here.`;
  return {
    species: animals,
    habitat,
    vegetation: vegetation ?? "unavailable",
    links: helpLinks(fire.centroid[0], fire.centroid[1]),
    tags: [
      { label: "CO2 now", value: now == null ? "unavailable" : `${Math.round(now).toLocaleString()} t`, detail: fuelNote },
      {
        label: "CO2 projected",
        value: projected == null ? "unavailable" : `${Math.round(projected).toLocaleString()} t`,
        detail: cone ? `Same formula on the cone area, about ${projectedHa?.toFixed(0)} ha. Estimate.` : "No cone, so projected CO2 was not calculated.",
      },
      { label: "Vegetation mapped here", value: vegetation ?? "unavailable", detail: "LANDFIRE 2024 existing vegetation at the centroid. Not a stem map." },
    ],
  };
}
