"use client";

/**
 * One-line "put it in scale" comparison with a dropdown, shown under a CO2 or acres number.
 * Connected to lib/core/compare.ts for the factors. Used by app/page.tsx and components/FirePanel.tsx.
 * Pure display: no API calls. The source of each factor shows on hover.
 */
import { useState } from "react";
import { scaled, type Comparison } from "../lib/core/compare";

export default function Compare({ amount, options, tone = "orange" }: { amount: number; options: Comparison[]; tone?: "orange" | "red" }) {
  const [id, setId] = useState(options[0].id);
  const choice = options.find((item) => item.id === id) ?? options[0];
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-white/5 px-2 py-1" title={choice.source}>
      <p className="min-w-0 text-xs text-neutral-300">
        ≈ <span className={`font-semibold tabular-nums ${tone === "red" ? "text-red-300" : "text-orange-200"}`}>{scaled(amount, choice)}</span>{" "}
        {choice.unit}
      </p>
      <select
        aria-label="Compare to"
        className="shrink-0 rounded border border-white/10 bg-neutral-950/70 px-1 py-0.5 text-[11px] text-neutral-300"
        value={id}
        onChange={(event) => setId(event.target.value)}
      >
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  );
}
