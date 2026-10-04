/**
 * Fetches wind, humidity, temperature, red-flag status, elevation, slope, and the next 6 forecast hours.
 * Connected to app/api/fire-detail/route.ts, Open-Meteo, and api.weather.gov.
 * Called only after a fire is clicked. The hourly list feeds lib/core/spread.ts.
 */
import type { WeatherHour } from "./spread";
import type { Tag } from "./tags";

export type Conditions = {
  forecastOk: boolean;
  windMph: number;
  windFromDeg: number;
  humidity: number | null;
  tempF: number | null;
  soil: number | null;
  slopePct: number | null;
  elevation: number | null;
  redFlag: string;
  tags: Tag[];
  hourly: WeatherHour[];
};

function hourIndex(times: string[], hoursAhead: number): number {
  const target = Date.now() + hoursAhead * 3600_000;
  let best = 0;
  let bestDiff = Infinity;
  times.forEach((time, index) => {
    const diff = Math.abs(Date.parse(/Z|[+-]\d\d:?\d\d$/.test(time) ? time : `${time}Z`) - target);
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

export function compass(degrees: number): string {
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

export async function getFireConditions(lat: number, lon: number, hoursAhead = 1): Promise<Conditions> {
  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    "&hourly=wind_speed_10m,wind_direction_10m,relative_humidity_2m,temperature_2m,soil_moisture_0_to_1cm" +
    "&wind_speed_unit=mph&temperature_unit=fahrenheit&forecast_days=2&timezone=GMT";
  const [forecastRes, terrain, flag] = await Promise.all([
    fetch(forecastUrl),
    elevation(lat, lon),
    redFlag(lat, lon).catch(() => "unavailable"),
  ]);

  if (!forecastRes.ok) {
    return {
      forecastOk: false,
      windMph: 0,
      windFromDeg: 0,
      humidity: null,
      tempF: null,
      soil: null,
      slopePct: terrain.slopePct,
      elevation: terrain.center,
      redFlag: flag,
      hourly: [],
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
      detail: `${windMph >= 15 ? "High wind. " : ""}${hoursAhead === 0 ? "Current forecast hour." : `Forecast hour closest to ${hoursAhead} h from now.`}`,
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
  ];

  const next: WeatherHour[] = [];
  if (hourly) {
    const start = hourIndex(hourly.time, 0);
    for (let h = 1; h <= 6; h += 1) {
      const j = Math.min(start + h, hourly.time.length - 1);
      next.push({
        windMph: hourly.wind_speed_10m[j] ?? 0,
        windFromDeg: hourly.wind_direction_10m[j] ?? 0,
        humidity: hourly.relative_humidity_2m[j] ?? null,
        tempF: hourly.temperature_2m[j] ?? null,
        soil: hourly.soil_moisture_0_to_1cm[j] ?? null,
      });
    }
  }

  return {
    forecastOk: Boolean(hourly),
    windMph,
    windFromDeg,
    humidity,
    tempF: temperature,
    soil,
    slopePct: terrain.slopePct,
    elevation: terrain.center,
    redFlag: flag,
    tags,
    hourly: next,
  };
}
