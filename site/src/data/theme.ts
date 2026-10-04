/** Theme part types, display conditions and popup triggers, as the Theme Builder offers them. */
export const partTypes = [
  "Header",
  "Footer",
  "Single page",
  "Single post",
  "Archive",
  "Search results",
  "404 page",
  "Loop item",
  "Section",
  "Page template",
  "Popup",
] as const;

export const popupTriggers = [
  "On page load",
  "After a delay",
  "On scroll",
  "On click",
  "On exit intent",
  "After inactivity",
] as const;
