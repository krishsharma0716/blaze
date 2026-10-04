/**
 * NYC address brief: year built, era hazards, solar permit check, and extra PLUTO building details.
 * Connected to app/api/address/route.ts, GeoSearch, PLUTO, and DOB NOW.
 * Runs only after an address is submitted. It does not call Grok.
 */
import { demoAddress } from "./demo";
import type { Tag } from "./tags";

export type AddressBrief = {
  title: string;
  lat: number;
  lon: number;
  tags: Tag[];
  details: { title: string; tags: Tag[] }[];
  summary: string;
};

type PlutoLot = {
  yearbuilt?: string;
  bldgclass?: string;
  numfloors?: string;
  yearalter1?: string;
  yearalter2?: string;
  landuse?: string;
  unitsres?: string;
  unitstotal?: string;
  bldgarea?: string;
  lotarea?: string;
  numbldgs?: string;
  bldgfront?: string;
  bldgdepth?: string;
  proxcode?: string;
  bsmtcode?: string;
  ext?: string;
  landmark?: string;
  histdist?: string;
  zonedist1?: string;
  firecomp?: string;
  policeprct?: string;
};

const LAND_USE: Record<string, string> = {
  "1": "One and two family",
  "2": "Multi-family walk-up",
  "3": "Multi-family elevator",
  "4": "Mixed residential and commercial",
  "5": "Commercial and office",
  "6": "Industrial and manufacturing",
  "7": "Transportation and utility",
  "8": "Public facilities and institutions",
  "9": "Open space and recreation",
  "10": "Parking",
  "11": "Vacant land",
};
const PROXIMITY: Record<string, string> = { "1": "Detached", "2": "Semi-attached", "3": "Attached" };
const BASEMENT: Record<string, string> = {
  "0": "None",
  "1": "Full, above grade",
  "2": "Full, below grade",
  "3": "Partial, above grade",
  "4": "Partial, below grade",
};
const EXTENSION: Record<string, string> = { E: "Extension", G: "Garage", EG: "Extension and garage", N: "None" };

function fireCompany(code: string | undefined): string | null {
  const match = code?.match(/^([ELQ])0*(\d+)$/i);
  if (!match) return code || null;
  const kind = { E: "Engine", L: "Ladder", Q: "Squad" }[match[1].toUpperCase() as "E" | "L" | "Q"];
  return `${kind} ${match[2]}`;
}

function count(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function plutoDetails(lot: PlutoLot): { title: string; tags: Tag[] }[] {
  const building: Tag[] = [];
  const add = (list: Tag[], label: string, value: string | null | undefined, detail: string) => {
    if (value) list.push({ label, value, detail });
  };
  add(building, "Land use", LAND_USE[String(Number(lot.landuse))], "PLUTO landuse.");
  const res = count(lot.unitsres);
  const total = count(lot.unitstotal);
  add(building, "Units", total ? `${total.toLocaleString()}${res ? ` (${res.toLocaleString()} residential)` : ""}` : null, "PLUTO unitstotal and unitsres.");
  add(building, "Floor area", count(lot.bldgarea) ? `${count(lot.bldgarea)!.toLocaleString()} sq ft` : null, "PLUTO bldgarea, all buildings on the lot.");
  add(building, "Lot area", count(lot.lotarea) ? `${count(lot.lotarea)!.toLocaleString()} sq ft` : null, "PLUTO lotarea.");
  const front = count(lot.bldgfront);
  const depth = count(lot.bldgdepth);
  add(building, "Footprint", front && depth ? `${Math.round(front)} × ${Math.round(depth)} ft` : null, "PLUTO bldgfront by bldgdepth, primary building.");
  add(building, "Buildings on lot", count(lot.numbldgs)?.toString(), "PLUTO numbldgs.");
  add(building, "Attachment", PROXIMITY[lot.proxcode ?? ""], "PLUTO proxcode. Attached buildings share walls with neighbors.");
  add(building, "Basement", BASEMENT[lot.bsmtcode ?? ""], "PLUTO bsmtcode.");
  add(building, "Extension or garage", lot.ext && lot.ext !== "N" ? EXTENSION[lot.ext] ?? lot.ext : null, "PLUTO ext.");
  add(building, "Second alteration", count(lot.yearalter2)?.toString(), "PLUTO yearalter2.");
  add(building, "Landmark", lot.landmark ? lot.landmark.toLowerCase().replace(/^./, (c) => c.toUpperCase()) : null, "PLUTO landmark.");
  add(building, "Historic district", lot.histdist, "PLUTO histdist.");
  add(building, "Zoning", lot.zonedist1, "PLUTO zonedist1.");

  const services: Tag[] = [];
  add(services, "Fire company", fireCompany(lot.firecomp), "PLUTO firecomp, the FDNY company whose area includes this lot.");
  add(services, "Police precinct", lot.policeprct ? `Precinct ${lot.policeprct}` : null, "PLUTO policeprct.");

  return [
    { title: "Building details", tags: building },
    { title: "Local services", tags: services },
  ].filter((group) => group.tags.length > 0);
}

const BOROUGHS = new Set(["Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"]);
const OUTSIDE_CITY = /\b(chicago|boston|seattle|houston|miami|los angeles|london|paris|philadelphia|newark|jersey city|yonkers|hoboken)\b/i;

type GeoFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    borough?: string;
    label?: string;
    name?: string;
    addendum?: { pad?: { bbl?: string } };
  };
};

function hazards(year: number, _buildingClass: string, proxcode: string | undefined): string[] {
  const lines: string[] = [];
  if (year > 0 && year < 1940) lines.push("Balloon framing and voids, knob-and-tube wiring, lead paint");
  if (year >= 1930 && year <= 1980) lines.push("Possible asbestos");
  if (year >= 1940 && year < 1978) lines.push("Lead paint");
  if (year >= 1965 && year <= 1973) lines.push("Possible aluminum branch wiring");
  if (year >= 1990) lines.push("Lightweight trusses and I-joists, early collapse");
  if (proxcode === "2" || proxcode === "3") lines.push("Shared cocklofts and party walls");
  return lines;
}

async function solarPermitOnFile(bbl: string): Promise<Tag> {
  const where = encodeURIComponent(`bbl='${bbl}' AND upper(solar_work_type_)='YES'`);
  try {
    const response = await fetch(
      `https://data.cityofnewyork.us/resource/w9ak-ipjd.json?$select=solar_work_type_,job_description&$where=${where}&$limit=5`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok) {
      return {
        label: "Solar permit on file",
        value: "unavailable",
        detail: "DOB NOW Build filings did not respond. This is not a roof inspection.",
      };
    }
    const rows = (await response.json()) as { solar_work_type_?: string; job_description?: string }[];
    const filing = rows.find((row) => /batter|storage/i.test(row.job_description ?? "")) ?? rows[0];
    const note = filing?.job_description?.replace(/\s+/g, " ").trim();
    const namesBattery = Boolean(note && /batter|energy storage/i.test(note));
    return {
      label: "Solar permit on file",
      value: filing ? "Yes" : "No record",
      detail: filing
        ? `${note ? `DOB NOW filing: ${note.slice(0, 280)}. ` : "A DOB NOW Build filing lists solar work. "}${namesBattery ? "The filing names a battery." : "The filing does not name a battery. Check before anyone goes to the roof."} Electrical-only jobs are not in this file.`
        : "No DOB NOW Build filing lists solar work for this lot. Electrical-only jobs are not in this file. This is not proof the roof has no panels.",
    };
  } catch {
    return {
      label: "Solar permit on file",
      value: "unavailable",
      detail: "DOB NOW Build filings did not respond. This is not a roof inspection.",
    };
  }
}

export async function getAddressBrief(address: string): Promise<AddressBrief | { error: string }> {
  const query = address.trim();
  if (!query) return { error: "This brief covers New York City only." };
  const saved = demoAddress(query);
  if (saved) return saved;
  try {
  const geo = await fetch(
    `https://geosearch.planninglabs.nyc/v2/search?text=${encodeURIComponent(query)}&size=5`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!geo.ok) return { error: "Address lookup unavailable." };
  const found = (await geo.json()) as {
    features?: GeoFeature[];
    geocoding?: { query?: { parsed_text?: { locality?: string; admin?: string; region?: string } } };
  };
  const features = (found.features ?? []).filter((item) => BOROUGHS.has(item.properties?.borough ?? ""));
  if (features.length === 0 || OUTSIDE_CITY.test(query)) {
    return { error: "This brief covers New York City only." };
  }
  const typed = features.find((item) => item.properties?.borough && query.toLowerCase().includes(item.properties.borough.toLowerCase()));
  const feature = typed ?? features.find((item) => item.properties?.borough === "Manhattan") ?? features[0];
  const borough = feature?.properties?.borough ?? "";
  const bbl = feature?.properties?.addendum?.pad?.bbl ?? "";
  const coords = feature?.geometry?.coordinates;
  if (!feature || !BOROUGHS.has(borough) || !bbl || !coords) {
    return { error: "This brief covers New York City only." };
  }

  const solarPending = solarPermitOnFile(bbl);
  const pluto = await fetch(
    `https://data.cityofnewyork.us/resource/64uk-42ks.json?$select=yearbuilt,bldgclass,numfloors,yearalter1,yearalter2,landuse,unitsres,unitstotal,bldgarea,lotarea,numbldgs,bldgfront,bldgdepth,proxcode,bsmtcode,ext,landmark,histdist,zonedist1,firecomp,policeprct&$where=bbl=${Number(bbl)}&$limit=1`,
    { signal: AbortSignal.timeout(20000) },
  );
  if (!pluto.ok) return { error: "Building record unavailable." };
  const lots = (await pluto.json()) as PlutoLot[];
  const lot = lots[0];
  if (!lot) return { error: "Building record unavailable." };

  const year = Number(lot.yearbuilt);
  const floors = Number(lot.numfloors);
  const altered = Number(lot.yearalter1);
  const buildingClass = lot.bldgclass ?? "";
  const era = Number.isFinite(year) ? hazards(year, buildingClass, lot.proxcode) : [];
  const solar = await solarPending;
  const title = feature.properties?.label || feature.properties?.name || query;

  const tags: Tag[] = [
    {
      label: "Year built",
      value: Number.isFinite(year) && year > 0 ? String(year) : "unavailable",
      detail: "PLUTO yearbuilt for this BBL. An alteration does not replace this year.",
    },
    {
      label: "Floors",
      value: Number.isFinite(floors) ? String(Math.round(floors)) : "unavailable",
      detail: "PLUTO numfloors.",
    },
    {
      label: "Building class",
      value: buildingClass || "unavailable",
      detail: "PLUTO bldgclass. A, B, and C are one-family, two-family, and walk-up buildings.",
    },
    {
      label: "Era hazards",
      value: era.length ? era.join("; ") : "None from the year-built table",
      detail: "From year built, building class, and attachment only. Not from an inspection.",
    },
  ];
  if (Number.isFinite(altered) && altered > 0) {
    tags.push({
      label: "Altered",
      value: String(altered),
      detail: "PLUTO yearalter1. This does not replace year built.",
    });
  }
  tags.push(solar);

  const summary = [
    `${title}. Built ${tags[0].value}, class ${tags[2].value}, ${tags[1].value} floors.`,
    era.length ? `Look out for ${era.join("; ")}.` : "No era hazard from the year-built table.",
    `Solar permit on file: ${solar.value}.`,
    fireCompany(lot.firecomp) ? `Fire company area: ${fireCompany(lot.firecomp)}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return { title, lat: coords[1], lon: coords[0], tags, details: plutoDetails(lot), summary };
  } catch {
    return { error: "Address lookup unavailable." };
  }
}
