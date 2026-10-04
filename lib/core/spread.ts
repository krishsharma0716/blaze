/**
 * Spread projection: natural growth in every direction plus faster growth downwind, hour by hour.
 * Connected to app/api/fire-detail/route.ts (projection) and lib/core/conditions.ts (hourly weather).
 * Simplified Rothermel-style rates, Simard fuel moisture, Anderson ellipse. Ember spotting is not modeled.
 */
import { areaHa, destination, partsOf, type LngLat } from "./geo";
import type { FireRecord } from "./fires";
import type { FuelKind } from "./recovery";

export type WeatherHour = {
  windMph: number;
  windFromDeg: number;
  humidity: number | null;
  tempF: number | null;
  soil: number | null;
};

export type Projection = {
  ring: LngLat[];
  hull: LngLat[];
  newHa: number;
  headMph: number;
  farthestMiles: number;
  farthestBearing: number;
  fuelMoisture: [number, number];
  lengthToBreadth: number;
  assumptions: string[];
};

const SPREAD: Record<FuelKind, { baseMph: number; windReduction: number; extinction: number; label: string }> = {
  grass: { baseMph: 0.06, windReduction: 0.4, extinction: 15, label: "grass" },
  shrub: { baseMph: 0.075, windReduction: 0.4, extinction: 25, label: "shrub" },
  forest: { baseMph: 0.015, windReduction: 0.2, extinction: 25, label: "forest litter" },
};

const BEARINGS = 72;
const MAX_HEAD_MPH = 6;

export function extinctionMoisture(fuel: FuelKind): number {
  return SPREAD[fuel].extinction;
}

export function fineFuelMoisture(humidity: number, tempF: number): number {
  if (humidity < 10) return 0.03229 + 0.281073 * humidity - 0.000578 * humidity * tempF;
  if (humidity < 50) return 2.22749 + 0.160107 * humidity - 0.01478 * tempF;
  return 21.0606 + 0.005565 * humidity * humidity - 0.00035 * humidity * tempF - 0.483199 * humidity;
}

function moistureDamping(moisture: number, extinction: number): number {
  const r = Math.min(1, Math.max(0, moisture / extinction));
  return Math.max(0, 1 - 2.59 * r + 5.11 * r * r - 3.52 * r * r * r);
}

function lengthToBreadth(midflameMph: number): number {
  const lb = 0.936 * Math.exp(0.2566 * midflameMph) + 0.461 * Math.exp(-0.1548 * midflameMph) - 0.397;
  return Math.min(8, Math.max(1, lb));
}

function liveFuelFactor(soil: number | null): number {
  if (soil == null) return 1;
  return Math.min(1.15, Math.max(0.85, 1.15 - 0.75 * soil));
}

function slopeFactor(slopePct: number | null): number {
  if (slopePct == null) return 1;
  const tan = slopePct / 100;
  return 1 + 4 * tan * tan;
}

function supportPoint(points: LngLat[], bearingDeg: number, milesPerLon: number): LngLat {
  const rad = (bearingDeg * Math.PI) / 180;
  const sx = Math.sin(rad) * milesPerLon;
  const sy = Math.cos(rad) * 69;
  let best = points[0];
  let bestScore = -Infinity;
  for (const point of points) {
    const score = point[0] * sx + point[1] * sy;
    if (score > bestScore) {
      bestScore = score;
      best = point;
    }
  }
  return best;
}

function angleGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function projectSpread(
  fire: FireRecord,
  weather: WeatherHour[],
  slopePct: number | null,
  fuel: FuelKind,
  hours: number,
  containment: number | null,
): Projection {
  const spec = SPREAD[fuel];
  const reach = new Array<number>(BEARINGS).fill(0);
  let headMph = 0;
  let maxLb = 1;
  const moistures: number[] = [];
  let pushX = 0;
  let pushY = 0;

  for (let h = 0; h < hours; h += 1) {
    const hour = weather[Math.min(h, weather.length - 1)];
    const moisture = hour.humidity != null && hour.tempF != null ? fineFuelMoisture(hour.humidity, hour.tempF) : 8;
    moistures.push(moisture);
    const midflame = hour.windMph * spec.windReduction;
    const windFactor = 1 + 1.2 * Math.pow(midflame, 1.5);
    const head = Math.min(
      MAX_HEAD_MPH,
      spec.baseMph * windFactor * moistureDamping(moisture, spec.extinction) * slopeFactor(slopePct) * liveFuelFactor(hour.soil),
    );
    const lb = lengthToBreadth(midflame);
    const root = Math.sqrt(lb * lb - 1);
    const headToBack = lb > 1 ? (lb + root) / (lb - root) : 1;
    const back = head / headToBack;
    const a = (head + back) / 2;
    const c = (head - back) / 2;
    const e = a > 0 ? c / a : 0;
    const downwind = (hour.windFromDeg + 180) % 360;
    for (let i = 0; i < BEARINGS; i += 1) {
      const phi = (((i * 360) / BEARINGS - downwind) * Math.PI) / 180;
      reach[i] += a > 0 ? (a * (1 - e * e)) / (1 - e * Math.cos(phi)) : 0;
    }
    headMph = Math.max(headMph, head);
    maxLb = Math.max(maxLb, lb);
    pushX += Math.sin((downwind * Math.PI) / 180) * Math.max(hour.windMph, 0.1);
    pushY += Math.cos((downwind * Math.PI) / 180) * Math.max(hour.windMph, 0.1);
  }

  const openShare = containment == null ? 1 : Math.max(0, Math.min(1, 1 - containment / 100));
  const openCenter = ((Math.atan2(pushX, pushY) * 180) / Math.PI + 360) % 360;
  for (let i = 0; i < BEARINGS; i += 1) {
    if (openShare < 1 && angleGap((i * 360) / BEARINGS, openCenter) > openShare * 180) reach[i] = 0;
  }

  const points = partsOf(fire.geometry).flat();
  const milesPerLon = Math.max(1, 69 * Math.cos((fire.centroid[1] * Math.PI) / 180));
  const hull: LngLat[] = [];
  const ring: LngLat[] = [];
  let farthestMiles = 0;
  let farthestBearing = 0;
  for (let i = 0; i < BEARINGS; i += 1) {
    const bearing = (i * 360) / BEARINGS;
    const support = supportPoint(points, bearing, milesPerLon);
    const last = hull[hull.length - 1];
    if (!last || last[0] !== support[0] || last[1] !== support[1]) hull.push(support);
    ring.push(destination(support, bearing, reach[i]));
    if (reach[i] > farthestMiles) {
      farthestMiles = reach[i];
      farthestBearing = bearing;
    }
  }
  ring.push(ring[0]);
  hull.push(hull[0]);
  const newHa = Math.max(0, areaHa(ring) - areaHa(hull));

  return {
    ring,
    hull,
    newHa,
    headMph,
    farthestMiles,
    farthestBearing,
    fuelMoisture: [Math.min(...moistures), Math.max(...moistures)],
    lengthToBreadth: maxLb,
    assumptions: [
      `Every hour the whole edge grows: slow natural spread in all directions plus faster spread downwind, using that hour's forecast.`,
      `No-wind spread for ${spec.label} is about ${spec.baseMph} mph when fully dry (simplified Rothermel fuel models).`,
      `Dead fuel moisture comes from temperature and humidity (Simard equilibrium moisture). Fuel at ${spec.extinction}% moisture or wetter stops spreading.`,
      "Wind is cut to flame height. The fire's shape is an ellipse whose length grows with wind (Anderson 1983).",
      containment == null
        ? "Containment is treated as zero, so the whole edge can grow."
        : `Only the uncontained ${Math.round(openShare * 100)}% of the edge grows, assumed to face downwind. Contained edges hold.`,
      "Slope uses an average effect. Aspect is not modeled, and water, roads, and bare ground are not subtracted.",
      "Ember spotting is not modeled.",
    ],
  };
}
