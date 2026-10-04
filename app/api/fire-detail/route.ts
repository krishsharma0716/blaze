/**
 * Overview or spread projection for the fire a judge clicked.
 * Connected to getFireConditions, getRecovery, airQuality, areaRisk, projectSpread, countBuildings, and LANDFIRE.
 * Without hours it returns the overview, area risks, and the fire environment dashboard.
 * With 1, 2, 3, or 6 hours it returns one projection.
 */
import { countBuildings } from "../../../lib/core/buildings";
import { compass, getFireConditions } from "../../../lib/core/conditions";
import type { FireRecord } from "../../../lib/core/fires";
import { co2Tonnes, fuelClass, fuelNote, getRecovery, vegetationAt } from "../../../lib/core/recovery";
import { aqiCategory, airQuality, areaRisk, NEARBY_MILES, sensitiveSites, terrainSlope, type TerrainSlope } from "../../../lib/core/risk";
import { extinctionMoisture, fineFuelMoisture, projectSpread } from "../../../lib/core/spread";
import type { Tag } from "../../../lib/core/tags";

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
  const fire: FireRecord = {
    id: "selected",
    name: "",
    acres: body.acres ?? null,
    containment: body.containment ?? null,
    state: null,
    centroid: [body.lon, body.lat],
    geometry: body.geometry,
  };
  try {
    const hours = [1, 2, 3, 6].includes(body.hours ?? 0) ? (body.hours as number) : null;
    if (hours == null) return Response.json(await overview(fire));
    return Response.json(await projection(fire, hours));
  } catch {
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}

type Level = "high" | "moderate" | "low" | "unknown";
type RiskTag = Tag & { level: Level };

async function overview(fire: FireRecord) {
  const [lat, lon] = [fire.centroid[1], fire.centroid[0]];
  const [conditions, recovery, air, area, terrain] = await Promise.all([
    getFireConditions(lat, lon, 0),
    getRecovery(fire),
    airQuality(lat, lon).catch(() => null),
    areaRisk(fire).catch(() => ({ highHazardShare: null, people: null, homes: null })),
    terrainSlope(fire).catch(() => null),
  ]);
  const sites = await sensitiveSites(fire, air ? [{ lon: fire.centroid[0], lat: fire.centroid[1], aqi: air.aqi }] : []).catch(
    () => ({ count: null, ran: false, guidance: "Air quality unavailable." }),
  );
  const overviewTags: Tag[] = [
    {
      label: "Acres burned",
      value: fire.acres == null ? "unavailable" : Math.round(fire.acres).toLocaleString(),
      detail: "WFIGS perimeter acres.",
    },
    {
      label: "Containment",
      value: fire.containment == null ? "unavailable" : `${Math.round(fire.containment)}%`,
      detail: "WFIGS percent contained.",
    },
    ...recovery.tags,
  ];
  const moisture =
    conditions.humidity != null && conditions.tempF != null ? fineFuelMoisture(conditions.humidity, conditions.tempF) : null;
  return {
    overview: overviewTags,
    conditions: conditions.tags,
    risks: risks(conditions, air, area, terrain, sites),
    environment: {
      fuel: recovery.fuel,
      vegetation: recovery.vegetation,
      fuelMoisture: moisture,
      extinction: extinctionMoisture(recovery.fuel),
      soil: conditions.soil,
      slopePct: terrain?.medianPct ?? conditions.slopePct,
      humidity: conditions.humidity,
      tempF: conditions.tempF,
      windMph: conditions.forecastOk ? conditions.windMph : null,
      windFrom: compass(conditions.windFromDeg),
      elevation: conditions.elevation,
    },
    scale: { acres: fire.acres, co2: recovery.co2Now },
    recovery: { species: recovery.species, speciesTotal: recovery.speciesTotal, habitat: recovery.habitat },
  };
}

function risks(
  conditions: Awaited<ReturnType<typeof getFireConditions>>,
  air: Awaited<ReturnType<typeof airQuality>>,
  area: Awaited<ReturnType<typeof areaRisk>>,
  terrain: TerrainSlope | null,
  sites: Awaited<ReturnType<typeof sensitiveSites>>,
): RiskTag[] {
  const list: RiskTag[] = [];
  if (air) {
    const now = aqiCategory(air.aqi);
    const peak = aqiCategory(air.peak);
    list.push({
      label: "Air quality now",
      value: `AQI ${Math.round(air.aqi)}, ${now.name}`,
      detail: `${air.pm25 == null ? "" : `PM2.5 ${air.pm25.toFixed(1)} µg/m³. `}Next 24 h peak AQI ${Math.round(air.peak)} (${peak.name}). Modeled estimate at the fire's center (Open-Meteo, CAMS); smoke right next to the flames is usually worse.`,
      level: peak.level === "high" ? "high" : now.level,
    });
  } else {
    list.push({ label: "Air quality now", value: "unavailable", detail: "Open-Meteo Air Quality did not respond.", level: "unknown" });
  }
  if (conditions.forecastOk) {
    list.push({
      label: "Smoke drift",
      value:
        conditions.windMph < 3
          ? "Calm, smoke stays near the fire"
          : `Toward the ${compass((conditions.windFromDeg + 180) % 360)} at ${conditions.windMph.toFixed(0)} mph`,
      detail:
        conditions.windMph < 3
          ? "Light wind lets smoke pool in nearby valleys, especially overnight."
          : "Wind carries smoke downwind, so towns in that direction usually get the worst air.",
      level: conditions.windMph >= 15 ? "high" : conditions.windMph >= 8 ? "moderate" : "low",
    });
  }
  list.push({
    label: "Fire weather alert",
    value: conditions.redFlag,
    detail: "National Weather Service red flag or fire weather alerts at this point. Other advisories are not shown.",
    level: conditions.redFlag === "unavailable" ? "unknown" : conditions.redFlag === "None active" ? "low" : "high",
  });
  list.push({
    label: "Wildfire hazard nearby",
    value: area.highHazardShare == null ? "unavailable" : `${Math.round(area.highHazardShare * 100)}% high or very high`,
    detail: `Share of burnable land within ${NEARBY_MILES} miles of the fire rated high or very high wildfire hazard potential (USFS, 2023). This is land that is hard to control if it ignites.`,
    level: area.highHazardShare == null ? "unknown" : area.highHazardShare >= 0.5 ? "high" : area.highHazardShare >= 0.2 ? "moderate" : "low",
  });
  list.push({
    label: "People living nearby",
    value: area.people == null ? "unavailable" : area.people.toLocaleString(),
    detail: `Residents within ${NEARBY_MILES} miles of the fire edge, including inside it. USFS Wildfire Risk to Communities population grid. Estimate.`,
    level: area.people == null ? "unknown" : area.people >= 10_000 ? "high" : area.people >= 500 ? "moderate" : "low",
  });
  list.push({
    label: "Homes nearby",
    value: area.homes == null ? "unavailable" : area.homes.toLocaleString(),
    detail: `Housing units within ${NEARBY_MILES} miles of the fire edge, including inside it. USFS Wildfire Risk to Communities. Estimate.`,
    level: area.homes == null ? "unknown" : area.homes >= 5_000 ? "high" : area.homes >= 200 ? "moderate" : "low",
  });
  const steep = terrain?.steepShare ?? null;
  list.push({
    label: "Flash floods after rain",
    value: steep == null ? "unavailable" : steep >= 0.4 ? "Higher, steep burned slopes" : steep >= 0.15 ? "Possible, some steep slopes" : "Lower, mostly gentle ground",
    detail: `${terrain ? `${Math.round(terrain.steepShare * 100)}% of ${terrain.samples} sampled spots in the fire are 30% slope or steeper. ` : ""}USGS: after a fire, heavy rain on steep burned ground can cause flash floods and debris flows. Rough guide, not a USGS assessment.`,
    level: steep == null ? "unknown" : steep >= 0.4 ? "high" : steep >= 0.15 ? "moderate" : "low",
  });
  list.push({
    label: "Schools, hospitals, nursing homes",
    value:
      sites.count == null
        ? "unavailable"
        : sites.ran
          ? `${sites.count.toLocaleString()} in AQI over 100`
          : "0 in AQI over 100",
    detail: sites.ran
      ? `OpenStreetMap amenities within ${NEARBY_MILES} miles whose nearest sampled AQI is over 100. ${sites.guidance}`
      : `US AQI is not over 100 at the fire's center, so this count was not run. ${sites.guidance}`,
    level: sites.count == null ? "unknown" : sites.count > 0 ? "high" : "low",
  });
  return list;
}

async function projection(fire: FireRecord, hours: number) {
  const [conditions, vegetation, terrain] = await Promise.all([
    getFireConditions(fire.centroid[1], fire.centroid[0], hours),
    vegetationAt(fire).catch(() => null),
    terrainSlope(fire).catch(() => null),
  ]);
  if (!conditions.forecastOk || conditions.hourly.length === 0) {
    return {
      hours,
      cone: null,
      hull: null,
      tags: [] as Tag[],
      assumptions: ["Weather was unavailable, so no spread projection was drawn.", "Ember spotting is not modeled."],
    };
  }
  const fuel = fuelClass(vegetation);
  const spread = projectSpread(fire, conditions.hourly, terrain?.medianPct ?? conditions.slopePct, fuel, hours, fire.containment);
  const buildings = await countBuildings(spread.ring, spread.hull);
  const co2 = co2Tonnes(spread.newHa, fuel);
  const last = conditions.hourly[Math.min(hours, conditions.hourly.length) - 1];
  const [dryest, wettest] = spread.fuelMoisture;
  if (spread.newHa === 0 && fire.containment != null && fire.containment >= 100) {
    return {
      hours,
      cone: null,
      hull: null,
      tags: [{ label: "Projected land burned", value: "0 acres", detail: "The fire is fully contained, so no growth is projected." }],
      assumptions: spread.assumptions,
    };
  }
  const tags: Tag[] = [
    {
      label: "Projected land burned",
      value: `${Math.round(spread.newHa * 2.47105).toLocaleString()} acres`,
      detail: `New ground outside the current fire's outer edge after ${hours} h, about ${spread.newHa.toFixed(0)} ha. Estimate.`,
    },
    {
      label: "Farthest spread",
      value: `${spread.farthestMiles.toFixed(2)} mi to the ${compass(spread.farthestBearing)}`,
      detail: `Fastest head spread about ${spread.headMph.toFixed(2)} mph. The fire's shape is about ${spread.lengthToBreadth.toFixed(1)} times longer than wide.`,
    },
    {
      label: "Fuel moisture",
      value: Math.abs(wettest - dryest) < 0.5 ? `${dryest.toFixed(0)}%` : `${dryest.toFixed(0)}–${wettest.toFixed(0)}%`,
      detail: `Dead fine fuel, estimated from temperature and humidity each hour. Vegetation: ${vegetation?.name ?? "unavailable, shrub defaults"}.`,
    },
    {
      label: "Buildings in the projection",
      value: buildings == null ? "unavailable" : buildings.toLocaleString(),
      detail: "OpenStreetMap buildings in the new growth band. Estimate.",
    },
    {
      label: "CO2 projected",
      value: `${Math.round(co2).toLocaleString()} t`,
      detail: `Same formula on the new area. ${fuelNote(vegetation)}`,
    },
    {
      label: `Weather at +${hours} h`,
      value: `${last.windMph.toFixed(0)} mph from ${compass(last.windFromDeg)}, ${last.humidity == null ? "?" : Math.round(last.humidity)}% RH, ${last.tempF == null ? "?" : last.tempF.toFixed(0)} °F`,
      detail: "Open-Meteo hourly forecast. Every hour in between is used, not just this one.",
    },
  ];
  return {
    hours,
    cone: spread.ring,
    hull: spread.hull,
    tags,
    assumptions: spread.assumptions,
  };
}
