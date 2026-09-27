/** Site-part types stored on `emvb_theme_parts.part_type` (S7a + S7c). Popups deferred. */
export const THEME_PART_TYPES = [
  "header",
  "footer",
  "error_404",
  "search_results",
  "single_page",
] as const;

export type ThemePartType = (typeof THEME_PART_TYPES)[number];

/** Body/main templates (S7c). Headers/footers are chrome, not content. */
export const CONTENT_THEME_PART_TYPES = ["error_404", "search_results", "single_page"] as const;

export type ContentThemePartType = (typeof CONTENT_THEME_PART_TYPES)[number];

export const THEME_PART_TYPE_LABELS: Record<ThemePartType, string> = {
  header: "Header",
  footer: "Footer",
  error_404: "Error 404",
  search_results: "Search Results",
  single_page: "Single Page",
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
