/**
 * VIIRS 375 m fire detections inside one box, as ground-sized squares colored later by fire radiative power.
 * Connected to app/api/thermal/route.ts. Uses the FIRMS area CSV when FIRMS_MAP_KEY is set,
 * otherwise the keyless FIRMS 24 h US files (same columns). Called only when the thermal overlay is on for a fire.
 */
type Box = [number, number, number, number];

export const FRP_RAMP: [number, string][] = [
  [0, "#450a0a"],
  [3, "#991b1b"],
  [10, "#dc2626"],
  [30, "#f97316"],
  [80, "#facc15"],
  [200, "#fefce8"],
];

export type ThermalResult = {
  collection: GeoJSON.FeatureCollection<GeoJSON.Polygon>;
  count: number;
  latest: string | null;
  earliest: string | null;
  source: string;
};

const AREA_SOURCES = ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"];
const OPEN_FILES = [
  "https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_USA_contiguous_and_Hawaii_24h.csv",
  "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_USA_contiguous_and_Hawaii_24h.csv",
  "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_USA_contiguous_and_Hawaii_24h.csv",
];

async function csv(url: string): Promise<Record<string, string>[]> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!response.ok) return [];
  const lines = (await response.text()).trim().split("\n");
  const header = lines[0]?.split(",") ?? [];
  if (!header.includes("latitude") || !header.includes("frp")) return [];
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(header.map((name, i) => [name, cells[i] ?? ""]));
  });
}

function square(lat: number, lon: number, scanKm: number, trackKm: number): GeoJSON.Polygon {
  const halfLon = scanKm / 2 / (111.32 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  const halfLat = trackKm / 2 / 110.57;
  return {
    type: "Polygon",
    coordinates: [
      [
        [lon - halfLon, lat - halfLat],
        [lon + halfLon, lat - halfLat],
        [lon + halfLon, lat + halfLat],
        [lon - halfLon, lat + halfLat],
        [lon - halfLon, lat - halfLat],
      ],
    ],
  };
}

export async function detectionsIn([west, south, east, north]: Box): Promise<ThermalResult> {
  const key = process.env.FIRMS_MAP_KEY;
  const area = `${west.toFixed(4)},${south.toFixed(4)},${east.toFixed(4)},${north.toFixed(4)}`;
  const urls = key
    ? AREA_SOURCES.map((source) => `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${source}/${area}/1`)
    : OPEN_FILES;
  const rows = (await Promise.all(urls.map((url) => csv(url).catch(() => [])))).flat();
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  let latest: string | null = null;
  let earliest: string | null = null;
  for (const row of rows) {
    const lat = Number(row.latitude);
    const lon = Number(row.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lon < west || lon > east || lat < south || lat > north) continue;
    const time = row.acq_time.padStart(4, "0");
    const at = `${row.acq_date}T${time.slice(0, 2)}:${time.slice(2)}:00Z`;
    if (!latest || at > latest) latest = at;
    if (!earliest || at < earliest) earliest = at;
    const scan = Number(row.scan) || 0.375;
    const track = Number(row.track) || 0.375;
    features.push({
      type: "Feature",
      properties: { frp: Number(row.frp) || 0, at, satellite: row.satellite, daynight: row.daynight },
      geometry: square(lat, lon, scan, track),
    });
  }
  return {
    collection: { type: "FeatureCollection", features },
    count: features.length,
    latest,
    earliest,
    source: key ? "FIRMS area API, last 24 h" : "FIRMS 24 h US files (no map key), last 24 h",
  };
}
