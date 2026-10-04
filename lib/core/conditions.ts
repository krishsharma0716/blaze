/**
 * Fetches wind, humidity, red-flag status, elevation, and slope for one fire.
 * Connected to app/api/fires/detail/route.ts, Open-Meteo, and api.weather.gov.
 * Called only after a fire is clicked.
 */
import type { FireRecord } from "./fires";
import type { LngLat } from "./geo";
import { projectSpread } from "./spread";
import type { Tag } from "./tags";

export type Conditions = {
  forecastOk: boolean;
  windMph: number;
  windFromDeg: number;
  humidity: number | null;
  slopePct: number | null;
  tags: Tag[];
  hotspotCount: number | null;
};

function hourIndex(times: string[], hoursAhead: number): number {
  const target = Date.now() + hoursAhead * 3600_000;
  let best = 0;
  let bestDiff = Infinity;
  times.forEach((time, index) => {
    const diff = Math.abs(Date.parse(time) - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = index;
    }
  });
  return best;
}

async function elevation(lat: number, lon: number): Promise<{ center: number | null; slopePct: number | null }> {
  const lats = [lat, lat + 0.02, lat - 0.02, lat, lat].join(",");
  const lons = [lon, lon, lon, lon + 0.02, lon - 0.02].join(",");
  const response = await fetch(
    `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`,
  );
  if (!response.ok) return { center: null, slopePct: null };
  const body = (await response.json()) as { elevation?: number[] };
  const values = body.elevation ?? [];
  if (values.length < 5 || values.some((n) => !Number.isFinite(n))) {
    return { center: values[0] ?? null, slopePct: null };
  }
  const [center, north, south, east, west] = values;
  const rise = Math.max(Math.abs(north - center), Math.abs(south - center), Math.abs(east - center), Math.abs(west - center));
  const runMeters = 0.02 * 111_000;
  return { center, slopePct: (rise / runMeters) * 100 };
}

function compass(degrees: number): string {
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return names[Math.round(degrees / 45) % 8] ?? "N";
}

async function redFlag(lat: number, lon: number): Promise<string> {
  const response = await fetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`, {
    headers: { "User-Agent": "mhacks2026 wildfire brief (hackathon demo)", Accept: "application/geo+json" },
  });
  if (!response.ok) return "unavailable";
  const body = (await response.json()) as { features?: { properties?: { event?: string } }[] };
  const events = (body.features ?? []).map((f) => f.properties?.event ?? "");
  const fireWeather = events.filter((event) => /red flag|fire weather/i.test(event));
  return fireWeather[0] ?? "None active";
}

async function hotspots(lat: number, lon: number): Promise<number | null> {
  const key = process.env.FIRMS_MAP_KEY;
  if (!key) return null;
  const west = lon - 0.2;
  const south = lat - 0.2;
  const east = lon + 0.2;
  const north = lat + 0.2;
  const response = await fetch(
    `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_SNPP_NRT/${west},${south},${east},${north}/1`,
  );
  if (!response.ok) return null;
  const text = await response.text();
  const lines = text.trim().split("\n");
  return Math.max(lines.length - 1, 0);
}

export async function getFireConditions(lat: number, lon: number, hoursAhead = 1): Promise<Conditions> {
  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    "&hourly=wind_speed_10m,wind_direction_10m,relative_humidity_2m,temperature_2m,soil_moisture_0_to_1cm" +
    "&wind_speed_unit=mph&temperature_unit=fahrenheit&forecast_days=1";
  const [forecastRes, terrain, flag, hotspotCount] = await Promise.all([
    fetch(forecastUrl),
    elevation(lat, lon),
    redFlag(lat, lon).catch(() => "unavailable"),
    hotspots(lat, lon).catch(() => null),
  ]);

  if (!forecastRes.ok) {
    return {
      forecastOk: false,
      windMph: 0,
      windFromDeg: 0,
      humidity: null,
      slopePct: terrain.slopePct,
      hotspotCount,
      tags: [{ label: "Conditions", value: "unavailable", detail: "Open-Meteo did not respond." }],
    };
  }

  const forecast = (await forecastRes.json()) as {
    hourly?: {
      time: string[];
      wind_speed_10m: number[];
      wind_direction_10m: number[];
      relative_humidity_2m: number[];
      temperature_2m: number[];
      soil_moisture_0_to_1cm: number[];
    };
  };
  const hourly = forecast.hourly;
  const i = hourly ? hourIndex(hourly.time, hoursAhead) : 0;
  const windMph = hourly?.wind_speed_10m[i] ?? 0;
  const windFromDeg = hourly?.wind_direction_10m[i] ?? 0;
  const humidity = hourly?.relative_humidity_2m[i] ?? null;
  const temperature = hourly?.temperature_2m[i] ?? null;
  const soil = hourly?.soil_moisture_0_to_1cm[i] ?? null;

  const tags: Tag[] = [
    {
      label: "Wind",
      value: `${windMph.toFixed(0)} mph from ${compass(windFromDeg)}`,
      detail: windMph >= 15 ? `High wind. Forecast hour closest to ${hoursAhead} h.` : `Forecast hour closest to ${hoursAhead} h.`,
    },
    {
      label: "Humidity",
      value: humidity == null ? "unavailable" : `${Math.round(humidity)}%`,
      detail: humidity != null && humidity < 25 ? "Low humidity." : "Relative humidity at 2 m.",
    },
    {
      label: "Temperature",
      value: temperature == null ? "unavailable" : `${temperature.toFixed(0)} °F`,
      detail: "Open-Meteo hourly forecast.",
    },
    {
      label: "Soil moisture",
      value: soil == null ? "unavailable" : soil.toFixed(3),
      detail: "0 to 1 cm, cubic meters per cubic meter.",
    },
    { label: "Red flag", value: flag, detail: "Only a red flag or fire weather alert. Other advisories are not shown here." },
    {
      label: "Elevation",
      value: terrain.center == null ? "unavailable" : `${Math.round(terrain.center)} m`,
      detail: "Open-Meteo elevation at the centroid.",
    },
    {
      label: "Slope",
      value: terrain.slopePct == null ? "unavailable" : `${terrain.slopePct.toFixed(0)}%`,
      detail: terrain.slopePct != null && terrain.slopePct > 20 ? "Steep. Estimated from points about 2 km away." : "Estimated from points about 2 km away.",
    },
    {
      label: "Hotspots",
      value: hotspotCount == null ? "unavailable" : String(hotspotCount),
      detail: hotspotCount == null ? "FIRMS_MAP_KEY is missing or the count failed." : "VIIRS count in a small box around the fire, last day.",
    },
  ];

  return { forecastOk: Boolean(hourly), windMph, windFromDeg, humidity, slopePct: terrain.slopePct, tags, hotspotCount };
}

export async function getFireDetail(fire: FireRecord, hours: number): Promise<{
  tags: Tag[];
  assumptions: string[];
  cone: LngLat[];
}> {
  const conditions = await getFireConditions(fire.centroid[1], fire.centroid[0], hours);
  const spread = projectSpread(fire, conditions.windMph, conditions.windFromDeg, conditions.humidity, conditions.slopePct, hours);
  return {
    tags: [
      {
        label: "Acres",
        value: fire.acres == null ? "unavailable" : Math.round(fire.acres).toLocaleString(),
        detail: "WFIGS perimeter acres.",
      },
      {
        label: "Containment",
        value: fire.containment == null ? "unavailable" : `${Math.round(fire.containment)}%`,
        detail: "WFIGS percent contained.",
      },
      ...conditions.tags,
    ],
    assumptions: spread.assumptions,
    cone: spread.cone,
  };
}
