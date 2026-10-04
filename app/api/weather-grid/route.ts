/**
 * AQI and wind at a 4×4 grid covering the selected fire.
 * Connected to lib/core/weatherGrid.ts and the separate AQI and wind overlays in app/page.tsx.
 * GET ?bbox=west,south,east,north. Boxes larger than 4 degrees are refused.
 */
import { weatherGrid } from "../../../lib/core/weatherGrid";

export async function GET(request: Request) {
  const parts = (new URL(request.url).searchParams.get("bbox") ?? "").split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return Response.json({ error: "unavailable" }, { status: 400 });
  }
  const [west, south, east, north] = parts;
  if (east <= west || north <= south || east - west > 4 || north - south > 4) {
    return Response.json({ error: "unavailable" }, { status: 400 });
  }
  try {
    return Response.json(await weatherGrid(west, south, east, north));
  } catch {
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
