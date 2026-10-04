/**
 * Satellite heat detections for the selected fire's box, as GeoJSON squares.
 * Connected to lib/core/thermal.ts and the thermal overlay in app/page.tsx.
 * GET ?bbox=west,south,east,north. Boxes larger than 6 degrees are refused.
 */
import { detectionsIn } from "../../../lib/core/thermal";

export async function GET(request: Request) {
  const parts = (new URL(request.url).searchParams.get("bbox") ?? "").split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return Response.json({ error: "unavailable" }, { status: 400 });
  }
  const [west, south, east, north] = parts;
  if (east <= west || north <= south || east - west > 6 || north - south > 6) {
    return Response.json({ error: "unavailable" }, { status: 400 });
  }
  try {
    return Response.json(await detectionsIn([west, south, east, north]));
  } catch {
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
