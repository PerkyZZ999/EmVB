/** Site-part types stored on `emvb_theme_parts.part_type` (S7a–S7d). Popups deferred. */
export const THEME_PART_TYPES = [
  "header",
  "footer",
  "error_404",
  "search_results",
  "single_page",
  "single_post",
  "archive",
  "loop_item",
] as const;

export type ThemePartType = (typeof THEME_PART_TYPES)[number];

/**
 * Body/main templates that compete for `<main>` (S7c + S7d).
 * `loop_item` is a reusable fragment referenced by Loop elements — not a page location.
 */
export const CONTENT_THEME_PART_TYPES = [
  "error_404",
  "search_results",
  "single_page",
  "single_post",
  "archive",
] as const;

export type ContentThemePartType = (typeof CONTENT_THEME_PART_TYPES)[number];

/** Reusable item templates (not selected by route). */
export const ITEM_THEME_PART_TYPES = ["loop_item"] as const;

export type ItemThemePartType = (typeof ITEM_THEME_PART_TYPES)[number];

export const THEME_PART_TYPE_LABELS: Record<ThemePartType, string> = {
  header: "Header",
  footer: "Footer",
  error_404: "Error 404",
  search_results: "Search Results",
  single_page: "Single Page",
  single_post: "Single Post",
  archive: "Archive",
  loop_item: "Loop Item",
};

export function isThemePartType(value: unknown): value is ThemePartType {
  return typeof value === "string" && (THEME_PART_TYPES as readonly string[]).includes(value);
}

export function parseThemePartType(value: unknown): ThemePartType | null {
  return isThemePartType(value) ? value : null;
}

export function isContentThemePartType(value: unknown): value is ContentThemePartType {
  return (
    typeof value === "string" && (CONTENT_THEME_PART_TYPES as readonly string[]).includes(value)
  );
}

export function isItemThemePartType(value: unknown): value is ItemThemePartType {
  return typeof value === "string" && (ITEM_THEME_PART_TYPES as readonly string[]).includes(value);
}
