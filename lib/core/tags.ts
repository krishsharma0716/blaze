/**
 * The only shape the page and the agent are allowed to show or speak.
 * Connected to speakBrief and, later, every brief function in lib/core.
 * A tag is a label, a value, and a short detail for the assumption.
 */
export type Tag = {
  label: string;
  value: string;
  detail: string;
};
