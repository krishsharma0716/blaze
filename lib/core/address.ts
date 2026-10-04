/**
 * NYC address brief: year built, era hazards, and a solar permit check.
 * Connected to app/api/address/route.ts, GeoSearch, PLUTO, and DOB NOW.
 * Runs only after an address is submitted. It does not call Grok.
 */
import type { Tag } from "./tags";

export type AddressBrief = {
  title: string;
  lat: number;
  lon: number;
  tags: Tag[];
  summary: string;
};

const BOROUGHS = new Set(["Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"]);

type GeoFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    borough?: string;
    label?: string;
    name?: string;
    addendum?: { pad?: { bbl?: string } };
  };
};

function hazards(year: number, buildingClass: string): string[] {
  const lines: string[] = [];
  if (year > 0 && year < 1940) lines.push("Balloon framing and voids, knob-and-tube wiring, lead paint");
  if (year >= 1930 && year <= 1980) lines.push("Possible asbestos");
  if (year > 0 && year < 1978) lines.push("Lead paint");
  if (year >= 1965 && year <= 1973) lines.push("Possible aluminum branch wiring");
  if (year >= 1990) lines.push("Lightweight trusses and I-joists, early collapse");
  if (/^[ABC]/i.test(buildingClass)) lines.push("Shared cocklofts and party walls");
  return lines;
}

async function solarPermitOnFile(bbl: string): Promise<Tag> {
  const where = encodeURIComponent(`bbl='${bbl}' AND solar_work_type_ IS NOT NULL`);
  try {
    const response = await fetch(
      `https://data.cityofnewyork.us/resource/w9ak-ipjd.json?$select=solar_work_type_&$where=${where}&$limit=1`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) {
      return {
        label: "Solar permit on file",
        value: "unavailable",
        detail: "DOB NOW Build filings did not respond. This is not a roof inspection.",
      };
    }
    const rows = (await response.json()) as { solar_work_type_?: string }[];
    const yes = rows.some((row) => row.solar_work_type_ && row.solar_work_type_.trim().length > 0);
    return {
      label: "Solar permit on file",
      value: yes ? "Yes" : "No record",
      detail: yes
        ? "A DOB NOW Build filing lists solar work. Check for battery storage. Electrical-only jobs are not in this file."
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
  const geo = await fetch(
    `https://geosearch.planninglabs.nyc/v2/search?text=${encodeURIComponent(query)}&size=1`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!geo.ok) return { error: "Address lookup unavailable." };
  const found = (await geo.json()) as { features?: GeoFeature[] };
  const feature = found.features?.[0];
  const borough = feature?.properties?.borough ?? "";
  const bbl = feature?.properties?.addendum?.pad?.bbl ?? "";
  const coords = feature?.geometry?.coordinates;
  if (!feature || !BOROUGHS.has(borough) || !bbl || !coords) {
    return { error: "This brief covers New York City only." };
  }

  const pluto = await fetch(
    `https://data.cityofnewyork.us/resource/64uk-42ks.json?$select=yearbuilt,bldgclass,numfloors,yearalter1&$where=bbl=${Number(bbl)}&$limit=1`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!pluto.ok) return { error: "Building record unavailable." };
  const lots = (await pluto.json()) as {
    yearbuilt?: string;
    bldgclass?: string;
    numfloors?: string;
    yearalter1?: string;
  }[];
  const lot = lots[0];
  if (!lot) return { error: "Building record unavailable." };

  const year = Number(lot.yearbuilt);
  const floors = Number(lot.numfloors);
  const altered = Number(lot.yearalter1);
  const buildingClass = lot.bldgclass ?? "";
  const era = Number.isFinite(year) ? hazards(year, buildingClass) : [];
  const solar = await solarPermitOnFile(bbl);
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
      detail: "From year built and building class only. Not from an inspection.",
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
  ].join(" ");

  return { title, lat: coords[1], lon: coords[0], tags, summary };
}
