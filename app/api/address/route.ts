/**
 * NYC address brief. The browser calls this only after a search is submitted.
 * Connected to getAddressBrief. Non-NYC text is rejected in one sentence.
 * Year built, class, floors, and solar come from live city requests.
 */
import { getAddressBrief } from "../../../lib/core/address";

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("q") ?? "";
  try {
    const brief = await getAddressBrief(address);
    if ("error" in brief) return Response.json(brief, { status: 400 });
    return Response.json(brief);
  } catch {
    return Response.json({ error: "Address lookup unavailable." }, { status: 502 });
  }
}
