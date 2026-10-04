/**
 * Returns live current US fire perimeters for the map.
 * Connected to listActiveFires. The browser calls this when the page opens.
 * Palisades is a separate route. This does not read fixtures.
 */
import { listActiveFires } from "../../../lib/core/fires";

export async function GET() {
  try {
    const fires = await listActiveFires();
    return Response.json({ fires });
  } catch {
    return Response.json({ fires: [], error: "unavailable" }, { status: 502 });
  }
}
