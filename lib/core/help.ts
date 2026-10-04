/**
 * Wildfire recovery donation and volunteer links, plus regional extras.
 * Connected to components/FirePanel.tsx (always-visible help card). No network calls.
 * Links are general, not assigned to one fire. Regional ones appear only near that region.
 */
import type { LngLat } from "./geo";

export type HelpLink = { group: "Forests" | "People"; name: string; url: string; note: string; regional?: boolean };

const NATIONAL: HelpLink[] = [
  { group: "Forests", name: "National Forest Foundation", url: "https://www.nationalforests.org/tree-planting-programs", note: "Reforestation on national forests." },
  { group: "Forests", name: "Forest Service Plant-a-Tree", url: "https://www.fs.usda.gov/working-with-us/donations", note: "The agency's seedling donations." },
  { group: "Forests", name: "American Forests", url: "https://www.americanforests.org/", note: "Large-scale restoration, including after fire." },
  { group: "People", name: "After the Fire USA", url: "https://afterthefireusa.org/", note: "Long-term community recovery." },
  { group: "People", name: "Red Cross wildfire relief", url: "https://www.redcross.org/about-us/our-work/disaster-relief/wildfire-relief.html", note: "Shelter and financial help right after the fire." },
];

export function helpLinks(point: LngLat | null): HelpLink[] {
  if (!point) return NATIONAL;
  const [lon, lat] = point;
  const california = lon < -114 && lon > -125 && lat > 32 && lat < 42.2;
  const tahoe = lon < -119.7 && lon > -120.4 && lat > 38.6 && lat < 39.5;
  const southernCalifornia = california && lat < 35.8;
  const regional: HelpLink[] = [];
  if (california) {
    regional.push({ group: "Forests", name: "Penny Pines", url: "https://www.nationalforests.org/get-involved/penny-pines", note: "California. About $68 toward an acre on a named national forest.", regional: true });
  }
  if (tahoe) regional.push({ group: "Forests", name: "Sugar Pine Foundation", url: "https://sugarpinefoundation.org/", note: "Tahoe burn scars.", regional: true });
  if (southernCalifornia) regional.push({ group: "Forests", name: "TreePeople", url: "https://www.treepeople.org/", note: "Southern California.", regional: true });
  return [...regional, ...NATIONAL];
}
