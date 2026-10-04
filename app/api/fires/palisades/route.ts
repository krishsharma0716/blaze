/**
 * Palisades Fire from the WFIGS history service.
 * Connected to getPalisadesFire. Called only when that button is pressed.
 * The match is the California perimeter of about 23,448 acres.
 */
import { getPalisadesFire } from "../../../../lib/core/fires";

export async function GET() {
  try {
    const fire = await getPalisadesFire();
    if (!fire) return Response.json({ error: "unavailable" }, { status: 404 });
    return Response.json({ fire });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
