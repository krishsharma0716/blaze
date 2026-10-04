/**
 * Fixed tools table for the iMessage agent. The team fills in the rows; the agent only quotes them.
 * Connected to lib/core/agentReply.ts, which matches rows against the active incident's tags.
 * Grok may pick rows but never adds tools, steps, or advice. Rows with todo: true are never sent.
 */
import type { Tag } from "./tags";

/** One condition on a stored incident tag, matched by tag label (for example "Floors"). */
export type When =
  | { tag: string; equals: string }
  | { tag: string; includes: string }
  | { tag: string; yearBefore: number }
  | { tag: string; yearFrom: number }
  | { tag: string; atLeast: number };

export type ToolRow = {
  /** Tool name, as the crew would say it. */
  tool: string;
  /** The row applies when any condition matches. An empty list means it always applies. */
  when: When[];
  /** What the tool is for, one sentence. */
  purpose: string;
  /** How to use it, copied verbatim into the reply. */
  howTo: string[];
  /** Placeholder rows are skipped until filled in. */
  todo?: boolean;
};

export const TOOLS: ToolRow[] = [
  {
    todo: true,
    tool: "TODO: tool name",
    when: [{ tag: "Solar permit on file", equals: "Yes" }],
    purpose: "TODO: what it is for.",
    howTo: ["TODO: how to use it."],
  },
  {
    todo: true,
    tool: "TODO: tool name",
    when: [{ tag: "Year built", yearBefore: 1940 }],
    purpose: "TODO: what it is for.",
    howTo: ["TODO: how to use it."],
  },
  {
    todo: true,
    tool: "TODO: tool name",
    when: [{ tag: "Floors", atLeast: 7 }],
    purpose: "TODO: what it is for.",
    howTo: ["TODO: how to use it."],
  },
];

export const TOOLS_FOOTER = "Reference only. Follow your officer and your department's training.";

export function readyTools(): ToolRow[] {
  return TOOLS.filter((row) => !row.todo);
}

/** The condition that made this row apply, described from the tag, or null if it does not apply. */
export function matchReason(row: ToolRow, tags: Tag[]): string | null {
  if (row.when.length === 0) return "";
  for (const condition of row.when) {
    const tag = tags.find((item) => item.label.toLowerCase() === condition.tag.toLowerCase());
    if (!tag) continue;
    const value = tag.value;
    const number = Number.parseFloat(value.replace(/,/g, ""));
    const hit =
      ("equals" in condition && value.toLowerCase() === condition.equals.toLowerCase()) ||
      ("includes" in condition && value.toLowerCase().includes(condition.includes.toLowerCase())) ||
      ("yearBefore" in condition && Number.isFinite(number) && number < condition.yearBefore) ||
      ("yearFrom" in condition && Number.isFinite(number) && number >= condition.yearFrom) ||
      ("atLeast" in condition && Number.isFinite(number) && number >= condition.atLeast);
    if (hit) return `${tag.label}: ${tag.value}`;
  }
  return null;
}
