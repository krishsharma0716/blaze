/**
 * Counts OpenStreetMap buildings in the projected growth band (projection minus the current fire's outline).
 * Connected to app/api/fire-detail/route.ts and the Overpass API.
 * An estimate of structures in the path. Returns null when Overpass is slow or rate-limited.
 */
import type { LngLat } from "./geo";

function poly(ring: LngLat[]): string {
  return ring.map(([lon, lat]) => `${lat.toFixed(5)} ${lon.toFixed(5)}`).join(" ");
}

export async function countBuildings(outer: LngLat[], inner: LngLat[] = []): Promise<number | null> {
  if (outer.length < 3) return null;
  const query =
    inner.length >= 3
      ? `[out:json][timeout:14];way["building"](poly:"${poly(outer)}")->.a;way.a(poly:"${poly(inner)}")->.b;(.a; - .b;);out count;`
      : `[out:json][timeout:14];way["building"](poly:"${poly(outer)}");out count;`;
  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "mhacks2026 wildfire brief (hackathon demo)" },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { elements?: { tags?: { ways?: string } }[] };
    const ways = Number(body.elements?.[0]?.tags?.ways);
    return Number.isFinite(ways) ? ways : null;
  } catch {
    return null;
  }
}
