/**
 * Small geometry helpers for fire perimeters and the spread cone.
 * Connected to lib/core/fires.ts and lib/core/spread.ts.
 * Coordinates are longitude, latitude. This file does not call the network.
 */
export type LngLat = [number, number];

export type FireGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
};

export function ringOf(geometry: FireGeometry): LngLat[] {
  const coords = geometry.coordinates;
  const ring = geometry.type === "Polygon" ? coords[0] : coords[0]?.[0];
  if (!Array.isArray(ring)) return [];
  return ring.filter((pair): pair is LngLat => Array.isArray(pair) && pair.length >= 2);
}

export function simplifyRing(ring: LngLat[], maxPoints = 80): LngLat[] {
  if (ring.length <= maxPoints) return ring;
  const step = Math.ceil(ring.length / maxPoints);
  const next = ring.filter((_, index) => index % step === 0);
  const last = ring[ring.length - 1];
  if (next.length === 0) return ring.slice(0, 1);
  if (next[next.length - 1][0] !== last[0] || next[next.length - 1][1] !== last[1]) next.push(last);
  return next;
}

export function centroidOf(ring: LngLat[]): LngLat {
  if (ring.length === 0) return [0, 0];
  let lon = 0;
  let lat = 0;
  for (const [x, y] of ring) {
    lon += x;
    lat += y;
  }
  return [lon / ring.length, lat / ring.length];
}

export function areaHa(ring: LngLat[]): number {
  if (ring.length < 3) return 0;
  const lat0 = (ring[0][1] * Math.PI) / 180;
  const mLat = 111_320;
  const mLon = 111_320 * Math.cos(lat0);
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[(i + 1) % ring.length];
    sum += lon1 * mLon * lat2 * mLat - lon2 * mLon * lat1 * mLat;
  }
  return Math.abs(sum) / 2 / 10_000;
}

export function destination(origin: LngLat, bearingDeg: number, miles: number): LngLat {
  const milesPerDegreeLat = 69;
  const latRad = (origin[1] * Math.PI) / 180;
  const milesPerDegreeLon = Math.max(1, 69 * Math.cos(latRad));
  const rad = (bearingDeg * Math.PI) / 180;
  return [
    origin[0] + (Math.sin(rad) * miles) / milesPerDegreeLon,
    origin[1] + (Math.cos(rad) * miles) / milesPerDegreeLat,
  ];
}
