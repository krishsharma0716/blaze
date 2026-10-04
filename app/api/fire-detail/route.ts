/**
 * Conditions and one spread cone for the fire a judge clicked.
 * Connected to getFireConditions and projectSpread.
 * Weather runs here, not when the map first opens.
 */
import { countBuildings } from "../../../lib/core/buildings";
import { getFireConditions } from "../../../lib/core/conditions";
import type { FireRecord } from "../../../lib/core/fires";
import { getRecovery } from "../../../lib/core/recovery";
import { projectSpread } from "../../../lib/core/spread";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    lat?: number;
    lon?: number;
    geometry?: FireRecord["geometry"];
    acres?: number | null;
    containment?: number | null;
    hours?: number;
  };
  if (body.lat == null || body.lon == null || !body.geometry) {
    return Response.json({ error: "unavailable" }, { status: 400 });
  }
  try {
    const hours = [1, 2, 3, 6].includes(body.hours ?? 0) ? (body.hours as number) : 1;
    const fire: FireRecord = {
      id: "selected",
      name: "",
      acres: body.acres ?? null,
      containment: body.containment ?? null,
      centroid: [body.lon, body.lat],
      geometry: body.geometry,
    };
    const conditions = await getFireConditions(body.lat, body.lon, hours);
    const spread = conditions.forecastOk
      ? projectSpread(fire, conditions.windMph, conditions.windFromDeg, conditions.humidity, conditions.slopePct, hours)
      : null;
    const [buildings, recovery] = await Promise.all([
      spread ? countBuildings(spread.cone) : Promise.resolve(null),
      getRecovery(fire, spread?.cone ?? null),
    ]);
    return Response.json({
      tags: [
        {
          label: "Acres",
          value: body.acres == null ? "unavailable" : Math.round(body.acres).toLocaleString(),
          detail: "WFIGS perimeter acres.",
        },
        {
          label: "Containment",
          value: body.containment == null ? "unavailable" : `${Math.round(body.containment)}%`,
          detail: "WFIGS percent contained.",
        },
        ...conditions.tags,
        {
          label: "Homes in the projection",
          value: buildings == null ? "unavailable" : String(buildings),
          detail: "OpenStreetMap buildings in the cone's box. An estimate, not an evacuation order.",
        },
        ...recovery.tags,
      ],
      recovery,
      assumptions: spread?.assumptions ?? ["Weather was unavailable, so no spread cone was drawn.", "Ember spotting is not modeled."],
      cone: spread ? { hours, polygon: { type: "Polygon" as const, coordinates: [spread.cone] } } : null,
    });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
