/**
 * Latest RainViewer radar tile template, checked against their public catalog.
 * Connected to the rain overlay in app/page.tsx. Called when that overlay is turned on.
 * No API key. Host and path come from https://api.rainviewer.com/public/weather-maps.json.
 */
import { radarTiles } from "../../../lib/core/weatherGrid";

export async function GET() {
  try {
    const radar = await radarTiles();
    if (!radar) return Response.json({ error: "unavailable" }, { status: 502 });
    return Response.json(radar);
  } catch {
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
