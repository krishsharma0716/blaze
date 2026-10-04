/**
 * Decides and writes the iMessage agent's reply: NYC building brief, wildfire dashboard brief, crew status, tools, or a follow-up.
 * Connected to agent/index.ts (real Photon + SpacetimeDB) and scripts/agent-sim.ts (in-memory store) through AgentStore.
 * Routing is rule-based. Grok only answers follow-ups from stored tags and picks tool rows; it never adds tactics.
 */
import { getAddressBrief, type AddressBrief } from "./address";
import { compass, getFireConditions } from "./conditions";
import { listActiveFires, getPalisadesFire, type FireRecord } from "./fires";
import { grokText } from "./grok";
import { co2Tonnes, fuelClass, fuelNote, vegetationAt } from "./recovery";
import { aqiCategory, airQuality, terrainSlope } from "./risk";
import { fineFuelMoisture } from "./spread";
import type { Tag } from "./tags";
import { matchReason, readyTools, TOOLS_FOOTER, type ToolRow } from "./tools";

export type ActiveIncident = { id: bigint; title: string; tags: Tag[] };

export type AgentStore = {
  activeIncident(conversationId: string): Promise<ActiveIncident | null>;
  openIncident(input: { title: string; kind: string; lat: number; lon: number; source: string }): Promise<bigint | null>;
  saveBrief(incidentId: bigint, tags: Tag[], summary: string, script: string): Promise<void>;
  setActiveIncident(conversationId: string, incidentId: bigint): Promise<void>;
  setCrewStatus(incidentId: bigint, sender: string, status: string): Promise<void>;
};

export type AgentReply = { text: string; voiceScript?: string; kind: string };

const NO_TACTICS = "I don't give tactics or a plan of attack. Follow your officer and your department's training.";
const HELP =
  "Send an NYC address, even inside a sentence, or a fire name. Say responding, on scene, or clear for crew status.";
const GREETING = /^(?:hey|hi|hello|yo|sup|thanks|thank you|ok|okay)[.!\s]*$/i;

const STATUS = /^(?:we(?:'re| are)\s+|unit\s+\S+\s+)?(responding|en route|on[\s-]scene|all clear|clear(?:ed)?)[.!\s]*$/i;
const TOOLS_ASK = /\b(tools?|what do i need|what should i bring|equipment|how do i use)\b/i;
const TACTICS = /\b(tactic|plan of attack|attack plan|strategy|offensive|defensive|ventilat\w*|how (?:should|do) we (?:attack|fight|enter|go in|vent)|where (?:should|do) we (?:enter|go in|vent|attack))\b/i;
const NEW_MEMBER = /\b(new (?:firefighter|member|probie|recruit)|questions? to ask|what (?:else )?(?:should|do) (?:i|we) ask|pay attention|things i should)\b/i;
const OUTSIDE_CITY = /\b(chicago|boston|seattle|houston|miami|los angeles|london|paris|philadelphia|newark|jersey city|yonkers|hoboken)\b/i;

export async function replyTo(
  text: string,
  conversationId: string,
  sender: string,
  store: AgentStore,
  options: { group?: boolean } = {},
): Promise<AgentReply | null> {
  const stripped = text.trim().replace(/^\s*photon[:,]?\s+/i, "");
  const addressed = /^\s*photon\b/i.test(text);
  const message = stripped;
  if (!message) return options.group && !addressed ? null : { kind: "help", text: HELP };

  const status = message.match(STATUS);
  if (status) return crewStatus(status[1], conversationId, sender, store);
  const askedAddress = extractAddress(message);
  if (askedAddress) {
    if (OUTSIDE_CITY.test(message)) return { kind: "outside", text: "This brief covers New York City only." };
    return address(askedAddress, message, conversationId, sender, store);
  }
  if (GREETING.test(message)) return { kind: "help", text: "Hey. Give me an NYC address or a fire name and I'll brief it." };

  if (options.group && !addressed) return null;

  if (TOOLS_ASK.test(message)) return tools(message, await store.activeIncident(conversationId));
  if (NEW_MEMBER.test(message) && !TACTICS.test(message)) {
    const active = await store.activeIncident(conversationId);
    if (active) return { kind: "advice", text: newMemberLines(active.tags).join("\n") };
    return {
      kind: "advice",
      text: "Ask your officer: Is anyone inside? Where do you want me? What's my way out?\nSend the address and I'll make those questions specific to the building.",
    };
  }
  if (TACTICS.test(message)) return { kind: "refusal", text: NO_TACTICS };

  const fire = await findFire(message);
  if (fire) return fireNumbers(fire, conversationId, sender, store);

  const active = await store.activeIncident(conversationId);
  if (!active) return { kind: "help", text: HELP };
  return followUp(message, active);
}

async function crewStatus(raw: string, conversationId: string, sender: string, store: AgentStore): Promise<AgentReply> {
  const status = /scene/i.test(raw) ? "on scene" : /clear/i.test(raw) ? "clear" : "responding";
  const active = await store.activeIncident(conversationId);
  if (!active) return { kind: "status", text: "No active incident in this chat yet. Text an NYC address or a fire name first." };
  await store.setCrewStatus(active.id, sender, status);
  return { kind: "status", text: `Logged ${sender}: ${status} at ${active.title}.` };
}

function briefLines(brief: AddressBrief): string[] {
  const tags = [...brief.tags, ...brief.details.flatMap((group) => group.tags)];
  const bullets = tags.map((tag) => {
    if (tag.label === "Solar permit on file" && tag.value === "Yes" && /batter/i.test(tag.detail)) {
      return "• Solar permit on file: Yes. The DOB filing names a battery";
    }
    return `• ${tag.label}: ${tag.value}`;
  });
  return [brief.title.replace(/, (NY|New York), USA$/i, ""), ...bullets, "Not an inspection."];
}

function extractAddress(message: string): string | null {
  const hits = [...message.matchAll(/\b(\d+[A-Za-z]?(?:-\d+)?\s+[^,?.!]{2,90})/g)]
    .map((match) =>
      match[1]
        .replace(/\s+/g, " ")
        .replace(/\s+\b(give|who|what|when|where|why|how|as|please|can|could|tell|and|with|for|about)\b[\s\S]*$/i, "")
        .trim(),
    )
    .filter((chunk) => chunk.length >= 5);
  const street = hits.find((chunk) => /\d+-\d+/.test(chunk) || /\b(st|street|ave|avenue|rd|road|blvd|pl|place|dr|drive|ln|lane|ct|way|ter|terrace)\b/i.test(chunk));
  return street ?? hits[0] ?? null;
}

function tagValue(brief: AddressBrief, label: string): string | undefined {
  return [...brief.tags, ...brief.details.flatMap((group) => group.tags)].find((tag) => tag.label === label)?.value;
}

function tagOf(tags: { label: string; value: string }[], label: string): string | undefined {
  return tags.find((tag) => tag.label === label)?.value;
}

function newMemberLines(tags: { label: string; value: string }[]): string[] {
  const value = (label: string) => tagOf(tags, label);
  if (!value("Year built") && !value("Fire company")) {
    const watch = [value("Wind"), value("Dead fuel moisture"), value("Slope"), value("Fire weather alert")].filter(Boolean).join(". ");
    return [
      watch ? `Watch for: ${watch}.` : "Watch the wind, the slope, and whether a red flag is up.",
      "Questions to ask your officer:",
      "1. What's my assignment, and what's my way out?",
      "2. Where is the smoke going?",
      "3. Is the fire still growing?",
    ];
  }
  const questions = ["Is anyone reported inside?", "Where do you want me, and what's my job?"];
  const floors = value("Floors");
  if (floors && floors !== "unavailable") questions.push(`It's ${floors === "1" ? "1 floor" : `${floors} floors`}. Which stair are we using, and is there a fire escape?`);
  const attachment = value("Attachment");
  if (attachment && /attached|semi/i.test(attachment)) questions.push("It shares a wall. Is there a cockloft or an open party wall?");
  const basement = value("Basement");
  if (basement && basement !== "None" && basement !== "unavailable") questions.push(`The basement is ${basement.toLowerCase()}. Is the fire below grade?`);
  if (value("Solar permit on file") === "Yes") questions.push("A solar permit is on file. Are there panels or a battery before anyone goes to the roof?");
  const year = Number(value("Year built"));
  if (year > 0 && year < 1940) questions.push("Built before 1940. Where do the voids run, and can fire reach the attic?");
  else if (year >= 1990) questions.push("Built after 1990. Ask if the roof is lightweight truss before anyone gets on it.");
  if (value("Altered")) questions.push(`It was altered in ${value("Altered")}. What changed from the original building?`);
  const hazards = value("Era hazards");
  return [
    hazards && hazards !== "None from the year-built table" ? `Watch for: ${hazards}.` : "Nothing on the year-built table stands out. Still ask what's overhead.",
    "Questions for a new member to ask the officer:",
    ...questions.map((question, index) => `${index + 1}. ${question}`),
  ];
}

function directAnswers(message: string, brief: AddressBrief): string[] {
  const lines: string[] = [];
  const company = tagValue(brief, "Fire company");
  if (/\b(first[- ]due|due truck|engine|ladder|truck|company|who(?:'s| is) (?:due|first))\b/i.test(message)) {
    lines.push(company ? `First due: ${company}.` : "First-due company is not on this lot record.");
  }
  return lines;
}

async function address(query: string, message: string, conversationId: string, sender: string, store: AgentStore): Promise<AgentReply> {
  const brief = await getAddressBrief(query);
  if ("error" in brief) {
    if (/new york city only/i.test(brief.error)) return { kind: "outside", text: "This brief covers New York City only." };
    return { kind: "address", text: `${brief.error} Try again in a minute.` };
  }
  const allTags = [...brief.tags, ...brief.details.flatMap((group) => group.tags)];
  const answers = directAnswers(message, brief);
  const facts = briefLines(brief);
  const lines = [...facts];
  if (answers.length) lines.splice(1, 0, ...answers);
  if (NEW_MEMBER.test(message)) lines.push(...newMemberLines(allTags));
  const script = lines
    .slice(1)
    .map((line) => line.replace(/^• /, "").replace(/\.$/, ""))
    .join(". ");
  const id = await store.openIncident({ title: brief.title, kind: "address", lat: brief.lat, lon: brief.lon, source: sender });
  if (id != null) {
    await store.saveBrief(id, allTags, brief.summary, script);
    await store.setActiveIncident(conversationId, id);
  }
  return { kind: "address", text: lines.join("\n"), voiceScript: `${lines[0]}. ${script}` };
}

let fireCache: { at: number; fires: FireRecord[] } | null = null;

async function findFire(message: string): Promise<FireRecord | null> {
  const asked = message.toLowerCase().replace(/[?.!]/g, "").replace(/\s+/g, " ").trim();
  const bare = asked.replace(/^(the\s+)?/, "").replace(/\s+fire$/, "");
  if (bare === "palisades") return getPalisadesFire().catch(() => null);
  if (!fireCache || Date.now() - fireCache.at > 10 * 60_000) {
    fireCache = { at: Date.now(), fires: await listActiveFires().catch(() => []) };
  }
  const named = fireCache.fires
    .filter((fire) => fire.name.length >= 3)
    .sort((a, b) => b.name.length - a.name.length)
    .find((fire) => {
      const name = fire.name.toLowerCase();
      const token = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return bare === name || asked.includes(`${name} fire`) || new RegExp(`\\b${token}\\b`).test(asked);
    });
  return named ?? null;
}

function formatCo2(tonnes: number): string {
  return tonnes >= 1_000_000 ? `${(tonnes / 1_000_000).toFixed(2)} million` : Math.round(tonnes).toLocaleString();
}

async function fireNumbers(fire: FireRecord, conversationId: string, sender: string, store: AgentStore): Promise<AgentReply> {
  const [lat, lon] = [fire.centroid[1], fire.centroid[0]];
  const [conditions, vegetation, air, terrain] = await Promise.all([
    getFireConditions(lat, lon, 0).catch(() => null),
    vegetationAt(fire).catch(() => null),
    airQuality(lat, lon).catch(() => null),
    terrainSlope(fire).catch(() => null),
  ]);
  const fuel = fuelClass(vegetation);
  const moisture =
    conditions?.humidity != null && conditions.tempF != null ? fineFuelMoisture(conditions.humidity, conditions.tempF) : null;
  const slope = terrain?.medianPct ?? conditions?.slopePct ?? null;
  const co2 = fire.acres == null ? null : co2Tonnes(fire.acres * 0.404686, fuel);
  const name = fire.id === "palisades" ? "Palisades Fire (January 2025)" : `${fire.name} Fire${fire.state ? `, ${fire.state}` : ""}`;
  const acres = fire.acres == null ? "Acres unavailable" : `${Math.round(fire.acres).toLocaleString()} acres`;
  const contained = fire.containment == null ? "containment unavailable" : `${Math.round(fire.containment)}% contained`;
  const wind = conditions?.forecastOk
    ? `Wind ${conditions.windMph.toFixed(0)} mph from the ${compass(conditions.windFromDeg)}`
    : "Wind unavailable";
  const aqi = air ? `AQI ${Math.round(air.aqi)}, ${aqiCategory(air.aqi).name}` : "AQI unavailable";
  const flag = conditions?.redFlag ?? "unavailable";
  const humidity = conditions?.humidity == null ? "humidity unavailable" : `humidity ${Math.round(conditions.humidity)}%`;
  const temp = conditions?.tempF == null ? "temp unavailable" : `${conditions.tempF.toFixed(0)} °F`;
  const fuelMoist = moisture == null ? "Fuel moisture unavailable" : `Fuel moisture ${moisture.toFixed(0)}%`;
  const slopeText = slope == null ? "slope unavailable" : `slope ${slope.toFixed(0)}%`;
  const lines = [
    name,
    `${acres}, ${contained}. ${fuel} fuel.`,
    `${wind}. ${aqi}. Fire weather: ${flag}.`,
    `${fuelMoist}, ${humidity}, ${temp}. ${slopeText}.`,
    co2 == null
      ? "CO2 estimate unavailable."
      : `CO2 estimate ${formatCo2(co2)} t, vegetation only, structures excluded.`,
  ];
  const tags: Tag[] = [
    { label: "Acres burned", value: fire.acres == null ? "unavailable" : Math.round(fire.acres).toLocaleString(), detail: "WFIGS perimeter acres." },
    { label: "Containment", value: fire.containment == null ? "unavailable" : `${Math.round(fire.containment)}%`, detail: "WFIGS percent contained." },
    { label: "Fuel", value: fuel, detail: "Same fuel class as the map dashboard." },
    {
      label: "Dead fuel moisture",
      value: moisture == null ? "unavailable" : `${moisture.toFixed(0)}%`,
      detail: "From temperature and humidity. Same number as the dashboard.",
    },
    ...(conditions?.tags ?? []),
    {
      label: "Air quality now",
      value: aqi,
      detail: air
        ? `Next 24 h peak AQI ${Math.round(air.peak)}. Modeled estimate at the fire's center (Open-Meteo, CAMS).`
        : "Open-Meteo Air Quality did not respond.",
    },
    {
      label: "Fire weather alert",
      value: flag,
      detail: "National Weather Service red flag or fire weather alerts at this point.",
    },
    { label: "CO2 now", value: co2 == null ? "unavailable" : `${Math.round(co2).toLocaleString()} t`, detail: fuelNote(vegetation) },
    {
      label: "Vegetation mapped here",
      value: vegetation?.name ?? "unavailable",
      detail: "LANDFIRE 2024 existing vegetation, most common natural type. Same source as the dashboard.",
    },
    {
      label: "Slope",
      value: slope == null ? "unavailable" : `${slope.toFixed(0)}%`,
      detail: "Median of sampled spots inside the fire, same as the dashboard.",
    },
  ];
  const script = lines.slice(1).join(" ");
  const id = await store.openIncident({ title: name, kind: "fire", lat, lon, source: sender });
  if (id != null) {
    await store.saveBrief(id, tags, lines.join(" "), script);
    await store.setActiveIncident(conversationId, id);
  }
  return { kind: "fire", text: lines.join("\n"), voiceScript: `${lines[0]}. ${script}` };
}

function renderRow(row: ToolRow, reason: string | null): string {
  return [`${row.tool}: ${row.purpose}`, reason ? `Applies because ${reason}.` : null, `How: ${row.howTo.join(" ")}`]
    .filter(Boolean)
    .join("\n");
}

async function tools(message: string, active: ActiveIncident | null): Promise<AgentReply> {
  const rows = readyTools();
  if (rows.length === 0) return { kind: "tools", text: `The tools table has no entries yet.\n${TOOLS_FOOTER}` };

  const lower = message.toLowerCase();
  const named = rows.find((row) => lower.includes(row.tool.toLowerCase()));
  if (named) return { kind: "tools", text: `${renderRow(named, active ? matchReason(named, active.tags) : null)}\n${TOOLS_FOOTER}` };

  if (/how do i use/i.test(message)) {
    const picked = await pickRow(message, rows);
    if (picked) return { kind: "tools", text: `${renderRow(picked, null)}\n${TOOLS_FOOTER}` };
    return { kind: "tools", text: `That tool is not in the reference table.\n${TOOLS_FOOTER}` };
  }

  const tags = active?.tags ?? [];
  const matched = rows
    .map((row) => ({ row, reason: matchReason(row, tags) }))
    .filter((item) => item.reason !== null)
    .slice(0, 3);
  if (matched.length === 0) {
    return {
      kind: "tools",
        text: `${active ? "No rows in the tools table match this incident." : "No active incident. Text an NYC address or a fire name first."}\n${TOOLS_FOOTER}`,
    };
  }
  return { kind: "tools", text: `${matched.map((item) => renderRow(item.row, item.reason || null)).join("\n\n")}\n${TOOLS_FOOTER}` };
}

async function pickRow(question: string, rows: ToolRow[]): Promise<ToolRow | null> {
  const list = rows.map((row, index) => `${index}: ${row.tool}`).join("\n");
  const answer = await grokText(
    "Pick the one tool from the numbered list that the question asks about. Reply with only its number, or NONE if no tool in the list matches. Do not add anything else.",
    `Tools:\n${list}\n\nQuestion: ${question}`,
  );
  const index = Number(answer?.match(/^\s*(\d+)\s*$/)?.[1]);
  return Number.isInteger(index) && rows[index] ? rows[index] : null;
}

async function followUp(question: string, active: ActiveIncident): Promise<AgentReply> {
  const facts = active.tags.map((tag) => `${tag.label}: ${tag.value} (${tag.detail})`).join("\n");
  const answer = await grokText(
    [
      "You answer a firefighter's question about one stored incident using ONLY the facts listed.",
      'If the facts do not answer it, reply exactly: "Not in the stored brief."',
      "Never give tactics, a plan of attack, recommendations, or safety advice. Do not add facts. At most two short sentences.",
    ].join(" "),
    `Incident: ${active.title}\nFacts:\n${facts}\n\nQuestion: ${question}`,
  );
  if (answer) return { kind: "followup", text: answer };

  const words = question.toLowerCase().match(/[a-z]{3,}/g) ?? [];
  const scored = active.tags
    .map((tag) => ({ tag, score: words.filter((word) => `${tag.label} ${tag.value}`.toLowerCase().includes(word)).length }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  if (scored.length === 0) return { kind: "followup", text: "Not in the stored brief." };
  return { kind: "followup", text: scored.map((item) => `${item.tag.label}: ${item.tag.value}.`).join("\n") };
}
