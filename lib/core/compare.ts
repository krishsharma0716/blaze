/**
 * Everyday comparisons that put tonnes of CO2 and acres burned into scale.
 * Connected to components/Compare.tsx, used in the totals card and the fire panel.
 * CO2 factors are from the EPA Greenhouse Gas Equivalencies references. Areas are Census land areas.
 */
export type Comparison = { id: string; label: string; per: number; unit: string; source: string };

export const CO2_COMPARISONS: Comparison[] = [
  { id: "cars", label: "Cars", per: 4.29, unit: "cars driven for a year", source: "EPA: 4.29 t CO2 per typical car per year" },
  { id: "homes", label: "Homes", per: 7.45, unit: "homes powered for a year", source: "EPA: 7.45 t CO2 per home per year" },
  { id: "gasoline", label: "Gasoline", per: 0.00889, unit: "gallons of gasoline burned", source: "EPA: 8.89 kg CO2 per gallon" },
  { id: "tankers", label: "Tanker trucks", per: 75.54, unit: "tanker trucks of gasoline", source: "EPA: 75.54 t CO2 per 8,500-gallon tanker" },
  { id: "forest", label: "Forest", per: 1.0, unit: "acres of forest to absorb it in a year", source: "EPA: 1 acre of average US forest takes up 1.00 t CO2 per year" },
];

export const AREA_COMPARISONS: Comparison[] = [
  { id: "fields", label: "Football fields", per: 1.32, unit: "football fields", source: "360 × 160 ft = 1.32 acres" },
  { id: "manhattan", label: "Manhattan", per: 14_502, unit: "times Manhattan", source: "Census: 22.66 sq mi of land" },
  { id: "dc", label: "Washington, DC", per: 39_123, unit: "times Washington, DC", source: "Census: 61.13 sq mi of land" },
  { id: "nyc", label: "New York City", per: 192_294, unit: "times New York City", source: "Census: 300.46 sq mi of land" },
  { id: "ri", label: "Rhode Island", per: 661_638, unit: "times Rhode Island", source: "Census: 1,033.81 sq mi of land" },
];

export function scaled(amount: number, comparison: Comparison): string {
  const n = amount / comparison.per;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)} million`;
  if (n >= 100) return Math.round(n).toLocaleString();
  if (n >= 10) return n.toFixed(0);
  return n.toFixed(1);
}
