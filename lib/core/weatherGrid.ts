/**
 * A 4×4 Open-Meteo grid around a fire: US AQI dots and downwind line segments, plus RainViewer tiles.
 * Connected to app/api/weather-grid and app/api/radar. Called when the AQI or wind overlay is on for a fire.
 * Forecast us_aqi is null (checked Oct 4), so AQI comes from the air-quality endpoint on the same points.
 */
import { destination, partsOf } from "./geo";
import type { FireRecord } from "./fires";

export type GridPoint = { lon: number; lat: number; aqi: number | null; windMph: number | null; windFromDeg: number | null };

export type WeatherGrid = {
  points: GridPoint[];
  aqi: GeoJSON.FeatureCollection<GeoJSON.Point>;
  wind: GeoJSON.FeatureCollection<GeoJSON.LineString>;
  maxAqi: number | null;
};

const SIZE = 4;

export function fireBox(fire: FireRecord, pad = 0.08): [number, number, number, number] {
  const pts = partsOf(fire.geometry).flat();
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
}

export function gridCoords(west: number, south: number, east: number, north: number): [number, number][] {
  const points: [number, number][] = [];
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const lon = west + ((east - west) * (col + 0.5)) / SIZE;
      const lat = south + ((north - south) * (row + 0.5)) / SIZE;
      points.push([lon, lat]);
    }
  }
  return points;
}

function asList<T>(body: T | T[]): T[] {
  return Array.isArray(body) ? body : [body];
}

export async function weatherGrid(west: number, south: number, east: number, north: number): Promise<WeatherGrid> {
  const coords = gridCoords(west, south, east, north);
  const lats = coords.map((p) => p[1].toFixed(4)).join(",");
  const lons = coords.map((p) => p[0].toFixed(4)).join(",");
  const [windRes, aqiRes] = await Promise.all([
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
        "&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=mph&timezone=GMT",
      { signal: AbortSignal.timeout(12_000), cache: "no-store" },
    ),
    fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}&current=us_aqi,pm2_5&timezone=GMT`,
      { signal: AbortSignal.timeout(12_000), cache: "no-store" },
    ),
  ]);
  const winds = windRes.ok
    ? asList(
        (await windRes.json()) as {
          latitude: number;
          longitude: number;
          current?: { wind_speed_10m?: number | null; wind_direction_10m?: number | null };
        },
      )
    : [];
  const airs = aqiRes.ok
    ? asList((await aqiRes.json()) as { latitude: number; longitude: number; current?: { us_aqi?: number | null } })
    : [];
  const points: GridPoint[] = coords.map(([lon, lat], index) => ({
    lon: winds[index]?.longitude ?? airs[index]?.longitude ?? lon,
    lat: winds[index]?.latitude ?? airs[index]?.latitude ?? lat,
    aqi: airs[index]?.current?.us_aqi ?? null,
    windMph: winds[index]?.current?.wind_speed_10m ?? null,
    windFromDeg: winds[index]?.current?.wind_direction_10m ?? null,
  }));
  const aqis = points.map((p) => p.aqi).filter((n): n is number => n != null);
  return {
    points,
    maxAqi: aqis.length ? Math.max(...aqis) : null,
    aqi: {
      type: "FeatureCollection",
      features: points
        .filter((point) => point.aqi != null)
        .map((point) => ({
          type: "Feature",
          properties: { aqi: point.aqi },
          geometry: { type: "Point" as const, coordinates: [point.lon, point.lat] },
        })),
    },
    wind: {
      type: "FeatureCollection",
      features: points
        .filter((point) => point.windFromDeg != null && point.windMph != null && point.windMph > 0.3)
        .map((point) => {
          const toward = ((point.windFromDeg as number) + 180) % 360;
          const cellMiles = Math.max(
            ((east - west) * 69 * Math.cos((((south + north) / 2) * Math.PI) / 180)) / SIZE,
            ((north - south) * 69) / SIZE,
          );
          const miles = Math.max(cellMiles * 0.28, Math.min(((point.windMph as number) / 12) * cellMiles * 0.7, cellMiles * 0.85));
          const start: [number, number] = [point.lon, point.lat];
          const end = destination(start, toward, miles);
          const left = destination(end, toward + 150, Math.max(miles * 0.28, cellMiles * 0.12));
          const right = destination(end, toward - 150, Math.max(miles * 0.28, cellMiles * 0.12));
          return {
            type: "Feature" as const,
            properties: { windMph: point.windMph, toward },
            geometry: { type: "LineString" as const, coordinates: [start, end, left, end, right] },
          };
        }),
    },
  };
}

export async function radarTiles(): Promise<{ tiles: string[]; time: string; source: string } | null> {
  const response = await fetch("https://api.rainviewer.com/public/weather-maps.json", {
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const body = (await response.json()) as {
    host?: string;
    radar?: { past?: { time: number; path: string }[] };
  };
  const latest = body.radar?.past?.at(-1);
  if (!body.host || !latest) return null;
  return {
    tiles: [`${body.host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`],
    time: new Date(latest.time * 1000).toISOString(),
    source: "RainViewer, latest US radar frame",
  };
}
