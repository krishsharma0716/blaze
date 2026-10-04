/**
 * Loads active US wildfire perimeters (not fully contained), plus the Palisades history feature.
 * Connected to app/api/fires/route.ts and the NIFC WFIGS FeatureServers.
 * Called when the map opens or when Palisades is selected. DEMO_MODE=1 serves fixtures/demo/palisades.json.
 */
import { demoPalisades } from "./demo";
import { areaHa, centroidOf, partsOf, ringOf, simplifyRing, type FireGeometry, type LngLat } from "./geo";

export type FirePolygon = FireGeometry;

export type FireRecord = {
  id: string;
  name: string;
  acres: number | null;
  containment: number | null;
  state: string | null;
  centroid: LngLat;
  geometry: FireGeometry;
};

type WfigsFeature = {
  properties?: Record<string, unknown>;
  geometry?: FireGeometry;
};

const CURRENT =
  "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query";
const HISTORY =
  "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters/FeatureServer/0/query";

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toRecord(feature: WfigsFeature, id: string): FireRecord | null {
  if (!feature.geometry) return null;
  const largest = ringOf(feature.geometry);
  if (largest.length < 3) return null;
  const parts = partsOf(feature.geometry)
    .map((part) => ({ part, area: areaHa(part) }))
    .sort((a, b) => b.area - a.area)
    .slice(0, 8)
    .map(({ part }) => [simplifyRing(part, 60)]);
  const props = feature.properties ?? {};
  return {
    id,
    name: String(props.poly_IncidentName ?? "Unnamed fire"),
    acres: num(props.poly_GISAcres),
    containment: num(props.attr_PercentContained),
    state: typeof props.attr_POOState === "string" ? props.attr_POOState.replace(/^US-/, "") : null,
    centroid: centroidOf(largest),
    geometry: parts.length === 1 ? { type: "Polygon", coordinates: parts[0] } : { type: "MultiPolygon", coordinates: parts },
  };
}

async function query(url: string, where: string): Promise<WfigsFeature[]> {
  const params = new URLSearchParams({
    where,
    outFields: "poly_IncidentName,poly_GISAcres,attr_PercentContained,attr_POOState",
    returnGeometry: "true",
    outSR: "4326",
    geometryPrecision: "3",
    f: "geojson",
    resultRecordCount: "2000",
  });
  const response = await fetch(`${url}?${params}`);
  if (!response.ok) throw new Error(String(response.status));
  const body = (await response.json()) as { features?: WfigsFeature[] };
  return body.features ?? [];
}

export async function listActiveFires(): Promise<FireRecord[]> {
  const features = await query(
    CURRENT,
    "attr_IncidentTypeCategory='WF' AND (attr_PercentContained IS NULL OR attr_PercentContained < 100)",
  );
  return features
    .map((feature, index) => toRecord(feature, `fire-${index}`))
    .filter((fire): fire is FireRecord => fire !== null)
    .sort((a, b) => (b.acres ?? 0) - (a.acres ?? 0));
}

export async function getPalisadesFire(): Promise<FireRecord | null> {
  const saved = demoPalisades();
  if (saved) return saved;
  const features = await query(
    HISTORY,
    "attr_POOState='US-CA' AND poly_IncidentName='PALISADES' AND poly_GISAcres=23448",
  );
  return features[0] ? toRecord(features[0], "palisades") : null;
}
