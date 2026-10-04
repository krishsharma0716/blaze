/**
 * Air quality and area risks around one fire: smoke, wildfire hazard, people and homes nearby.
 * Connected to app/api/fire-detail/route.ts. Calls Open-Meteo Air Quality and USFS Wildfire Risk to Communities.
 * Called only after a fire is clicked. Each source falls back to null, shown as "unavailable".
 */
import { bufferHull, partsOf } from "./geo";
import type { FireRecord } from "./fires";

const USFS = "https://imagery.geoplatform.gov/iipp/rest/services/Fire_Aviation";
export const NEARBY_MILES = 5;

export type AirQuality = { aqi: number; pm25: number | null; peak: number };
export type AreaRisk = { highHazardShare: number | null; people: number | null; homes: number | null };

export function aqiCategory(aqi: number): { name: string; level: "low" | "moderate" | "high" } {
  if (aqi <= 50) return { name: "Good", level: "low" };
  if (aqi <= 100) return { name: "Moderate", level: "moderate" };
  if (aqi <= 150) return { name: "Unhealthy for sensitive groups", level: "high" };
  if (aqi <= 200) return { name: "Unhealthy", level: "high" };
  if (aqi <= 300) return { name: "Very unhealthy", level: "high" };
  return { name: "Hazardous", level: "high" };
}

/** One line of EPA-style guidance for sensitive groups. Not a medical or evacuation order. */
export function aqiGuidance(aqi: number): string {
  if (aqi <= 50) return "Sensitive groups: no extra outdoor caution from this AQI.";
  if (aqi <= 100) return "Sensitive groups: unusually sensitive people should consider less time outdoors.";
  if (aqi <= 150) return "Sensitive groups: children, older adults, and people with heart or lung disease should reduce outdoor activity.";
  if (aqi <= 200) return "Sensitive groups: stay indoors and keep activity light.";
  if (aqi <= 300) return "Sensitive groups: stay indoors.";
  return "Sensitive groups: remain indoors.";
}

export type SensitiveSites = { count: number | null; ran: boolean; guidance: string };

export async function sensitiveSites(
  fire: FireRecord,
  cells: { lon: number; lat: number; aqi: number | null }[],
): Promise<SensitiveSites> {
  const high = cells.filter((cell) => cell.aqi != null && cell.aqi > 100);
  const peak = Math.max(0, ...cells.map((cell) => cell.aqi ?? 0));
  const guidance = aqiGuidance(peak);
  if (high.length === 0) return { count: 0, ran: false, guidance };

  const ring = bufferHull(partsOf(fire.geometry).flat(), NEARBY_MILES);
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  const south = Math.min(...lats);
  const west = Math.min(...lons);
  const north = Math.max(...lats);
  const east = Math.max(...lons);
  const query =
    `[out:json][timeout:14];(` +
    `nwr["amenity"="school"](${south},${west},${north},${east});` +
    `nwr["amenity"="hospital"](${south},${west},${north},${east});` +
    `nwr["amenity"="nursing_home"](${south},${west},${north},${east});` +
    `);out center;`;
  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "mhacks2026 wildfire brief (hackathon demo)" },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { count: null, ran: true, guidance };
    const body = (await response.json()) as {
      elements?: { lat?: number; lon?: number; center?: { lat: number; lon: number } }[];
    };
    const count = (body.elements ?? []).filter((el) => {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (lat == null || lon == null) return false;
      let nearest = high[0];
      let best = Infinity;
      for (const cell of high) {
        const d = (cell.lat - lat) ** 2 + (cell.lon - lon) ** 2;
        if (d < best) {
          best = d;
          nearest = cell;
        }
      }
      return nearest.aqi != null && nearest.aqi > 100;
    }).length;
    return { count, ran: true, guidance };
  } catch {
    return { count: null, ran: true, guidance };
  }
}

export async function airQuality(lat: number, lon: number): Promise<AirQuality | null> {
  const response = await fetch(
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      "&current=us_aqi,pm2_5&hourly=us_aqi&forecast_days=2&timezone=GMT",
    { signal: AbortSignal.timeout(10_000), cache: "no-store" },
  );
  if (!response.ok) return null;
  const body = (await response.json()) as {
    current?: { us_aqi?: number | null; pm2_5?: number | null };
    hourly?: { time: string[]; us_aqi: (number | null)[] };
  };
  const aqi = body.current?.us_aqi;
  if (aqi == null) return null;
  const now = Date.now();
  const ahead = (body.hourly?.time ?? [])
    .map((time, index) => ({ at: Date.parse(`${time}Z`), value: body.hourly?.us_aqi[index] ?? null }))
    .filter((hour) => hour.at >= now - 3600_000 && hour.at <= now + 24 * 3600_000 && hour.value != null)
    .map((hour) => hour.value as number);
  return { aqi, pm25: body.current?.pm2_5 ?? null, peak: Math.max(aqi, ...ahead) };
}

export type TerrainSlope = { medianPct: number; steepShare: number; samples: number };

export async function terrainSlope(fire: FireRecord): Promise<TerrainSlope | null> {
  const outline = partsOf(fire.geometry).flat();
  if (outline.length === 0) return null;
  const [cx, cy] = fire.centroid;
  const spots: [number, number][] = [[cx, cy]];
  const step = Math.max(1, Math.floor(outline.length / 9));
  for (let i = 0; i < outline.length && spots.length < 10; i += step) {
    const [x, y] = outline[i];
    spots.push([x + (cx - x) * 0.3, y + (cy - y) * 0.3]);
  }
  const dLat = 0.003;
  const dLon = dLat / Math.max(0.2, Math.cos((cy * Math.PI) / 180));
  const coords = spots.flatMap(([x, y]) => [
    [x, y],
    [x, y + dLat],
    [x, y - dLat],
    [x + dLon, y],
    [x - dLon, y],
  ]);
  const response = await fetch(
    `https://api.open-meteo.com/v1/elevation?latitude=${coords.map((c) => c[1].toFixed(5)).join(",")}` +
      `&longitude=${coords.map((c) => c[0].toFixed(5)).join(",")}`,
    { signal: AbortSignal.timeout(10_000), cache: "no-store" },
  );
  if (!response.ok) return null;
  const heights = ((await response.json()) as { elevation?: number[] }).elevation ?? [];
  const runMeters = dLat * 111_000;
  const slopes: number[] = [];
  for (let i = 0; i + 4 < heights.length; i += 5) {
    const [center, ...around] = heights.slice(i, i + 5);
    if (![center, ...around].every(Number.isFinite)) continue;
    slopes.push((Math.max(...around.map((h) => Math.abs(h - center))) / runMeters) * 100);
  }
  if (slopes.length === 0) return null;
  slopes.sort((a, b) => a - b);
  return {
    medianPct: slopes[Math.floor(slopes.length / 2)],
    steepShare: slopes.filter((s) => s >= 30).length / slopes.length,
    samples: slopes.length,
  };
}

async function rasterStats(service: string, ring: [number, number][]): Promise<{ sum: number; counts: number[]; skip: number } | null> {
  const params = new URLSearchParams({
    geometry: JSON.stringify({ rings: [ring], spatialReference: { wkid: 4326 } }),
    geometryType: "esriGeometryPolygon",
    f: "json",
  });
  const response = await fetch(`${USFS}/${service}/ImageServer/computeStatisticsHistograms?${params}`, {
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const body = (await response.json()) as {
    statistics?: { sum: number; skipX?: number; skipY?: number }[];
    histograms?: { counts: number[] }[];
  };
  const stats = body.statistics?.[0];
  if (!stats) return null;
  return { sum: stats.sum, counts: body.histograms?.[0]?.counts ?? [], skip: (stats.skipX ?? 1) * (stats.skipY ?? 1) };
}

export async function areaRisk(fire: FireRecord): Promise<AreaRisk> {
  const ring = bufferHull(partsOf(fire.geometry).flat(), NEARBY_MILES);
  const [hazard, people, homes] = await Promise.all([
    rasterStats("USFS_EDW_RMRS_WildfireHazardPotentialClassified", ring).catch(() => null),
    rasterStats("USFS_EDW_RMRS_WRC_PopulationCount", ring).catch(() => null),
    rasterStats("USFS_EDW_RMRS_WRC_HousingUnitCount", ring).catch(() => null),
  ]);
  let highHazardShare: number | null = null;
  if (hazard && hazard.counts.length >= 6) {
    const burnable = hazard.counts.slice(1, 6).reduce((sum, n) => sum + n, 0);
    if (burnable > 0) highHazardShare = (hazard.counts[4] + hazard.counts[5]) / burnable;
  }
  return {
    highHazardShare,
    people: people ? Math.round(people.sum * people.skip) : null,
    homes: homes ? Math.round(homes.sum * homes.skip) : null,
  };
}
