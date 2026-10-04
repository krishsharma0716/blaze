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

function cleanRing(ring: unknown): LngLat[] {
  if (!Array.isArray(ring)) return [];
  return ring.filter((pair): pair is LngLat => Array.isArray(pair) && pair.length >= 2);
}

export function partsOf(geometry: FireGeometry): LngLat[][] {
  if (geometry.type === "Polygon") return [cleanRing(geometry.coordinates[0])];
  return (geometry.coordinates as number[][][][]).map((polygon) => cleanRing(polygon[0])).filter((ring) => ring.length >= 3);
}

export function ringOf(geometry: FireGeometry): LngLat[] {
  let best: LngLat[] = [];
  let bestArea = -1;
  for (const ring of partsOf(geometry)) {
    const area = areaHa(ring);
    if (area > bestArea) {
      best = ring;
      bestArea = area;
    }
  }
  return best;
}

export function convexHull(points: LngLat[]): LngLat[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const cross = (o: LngLat, a: LngLat, b: LngLat) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: LngLat[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: LngLat[] = [];
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function counterClockwise(ring: LngLat[]): LngLat[] {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum < 0 ? [...ring].reverse() : ring;
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

export function bufferHull(points: LngLat[], miles: number, steps = 36): LngLat[] {
  const hull = convexHull(points);
  if (hull.length === 0) return [];
  const milesPerLon = Math.max(1, 69 * Math.cos((hull[0][1] * Math.PI) / 180));
  const ring: LngLat[] = [];
  for (let i = 0; i < steps; i += 1) {
    const bearing = (360 * i) / steps;
    const rad = (bearing * Math.PI) / 180;
    let best = hull[0];
    let bestDot = -Infinity;
    for (const point of hull) {
      const dot = point[0] * milesPerLon * Math.sin(rad) + point[1] * 69 * Math.cos(rad);
      if (dot > bestDot) {
        bestDot = dot;
        best = point;
      }
    }
    ring.push(destination(best, bearing, miles));
  }
  ring.push(ring[0]);
  return ring;
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
