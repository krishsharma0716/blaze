/**
 * Builds one downwind spread cone for the selected interval.
 * Connected to getFireDetail and the map cone layer.
 * This is a projection. Ember spotting is not included.
 */
import { destination, ringOf, type LngLat } from "./geo";
import type { FireRecord } from "./fires";

export function projectSpread(
  fire: FireRecord,
  windMph: number,
  windFromDeg: number,
  humidity: number | null,
  slopePct: number | null,
  hours: number,
): { cone: LngLat[]; assumptions: string[] } {
  const humidityFactor = humidity == null ? 1 : humidity >= 60 ? 0.4 : humidity >= 40 ? 0.7 : 1;
  const slopeFactor = slopePct != null && slopePct > 20 ? 1.4 : slopePct != null && slopePct > 10 ? 1.15 : 1;
  const miles = Math.max(0.1 * windMph * humidityFactor * slopeFactor * hours, 0.05);
  const halfAngle = windMph >= 15 ? 15 : 30;
  const downwind = (windFromDeg + 180) % 360;
  const rad = (downwind * Math.PI) / 180;
  let origin = fire.centroid;
  let best = -Infinity;
  for (const point of ringOf(fire.geometry)) {
    const score = point[0] * Math.sin(rad) + point[1] * Math.cos(rad);
    if (score > best) {
      best = score;
      origin = point;
    }
  }
  const cone: LngLat[] = [origin];
  for (let i = 0; i <= 8; i += 1) {
    cone.push(destination(origin, downwind - halfAngle + (2 * halfAngle * i) / 8, miles));
  }
  cone.push(origin);
  return {
    cone,
    assumptions: [
      "Direction is downwind from the perimeter edge.",
      "Distance is about 10% of open wind speed, scaled by humidity and slope, times the interval.",
      `Cone half-angle is ${halfAngle} degrees.`,
      "Ember spotting is not modeled.",
    ],
  };
}
