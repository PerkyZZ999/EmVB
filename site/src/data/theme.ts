import {
  THEME_PART_TYPES,
  THEME_PART_TYPE_LABELS,
} from "../../../packages/emvb/src/core/theme/part-types.ts";

/** Theme part types as the Theme Builder names them. */
export const partTypes = THEME_PART_TYPES.map((type) => THEME_PART_TYPE_LABELS[type]);

export const popupTriggers = [
  "On page load",
  "After a delay",
  "On scroll",
  "On click",
  "On exit intent",
  "After inactivity",
] as const;
