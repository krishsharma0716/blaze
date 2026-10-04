/**
 * Signs a judge's phone up with Photon so they can text the iMessage agent.
 * Connected to the Text the agent card in components/FirePanel.tsx.
 * POST { phone }. Creates a shared Spectrum user and returns the line to text. The project secret stays on the server.
 */
const STARTER = "350 Fifth Avenue, Manhattan. What do I expect? As a new member, what should I pay attention to?";

function e164(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (trimmed.startsWith("+") && /^\+[1-9]\d{6,14}$/.test(`+${digits}`)) return `+${digits}`;
  return null;
}

function displayPhone(e164Number: string): string {
  const match = e164Number.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (!match) return e164Number;
  return `+1 (${match[1]}) ${match[2]}-${match[3]}`;
}

export async function POST(request: Request) {
  const projectId = process.env.SPECTRUM_PROJECT_ID ?? "";
  const projectSecret = process.env.SPECTRUM_PROJECT_SECRET ?? "";
  if (!projectId || !projectSecret) return Response.json({ error: "Text signup is unavailable." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { phone?: string } | null;
  const phone = e164(body?.phone ?? "");
  if (!phone) return Response.json({ error: "Enter a mobile number, including area code." }, { status: 400 });

  try {
    const auth = `Basic ${Buffer.from(`${projectId}:${projectSecret}`).toString("base64")}`;
    const created = await fetch(`https://spectrum.photon.codes/projects/${projectId}/users`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "shared", phoneNumber: phone }),
      signal: AbortSignal.timeout(12_000),
    });
    const payload = (await created.json().catch(() => null)) as {
      data?: { id?: string; assignedPhoneNumber?: string | null };
    } | null;
    const user = payload?.data;
    if (!created.ok || !user?.id || !user.assignedPhoneNumber) {
      return Response.json({ error: "Photon could not add that number. Try again in a minute." }, { status: 502 });
    }
    const openUrl = `https://spectrum.photon.codes/users/${user.id}/redirect?msg=${encodeURIComponent(STARTER)}`;
    return Response.json({
      textNumber: displayPhone(user.assignedPhoneNumber),
      openUrl,
      starter: STARTER,
    });
  } catch {
    return Response.json({ error: "Photon could not add that number. Try again in a minute." }, { status: 502 });
  }
}
