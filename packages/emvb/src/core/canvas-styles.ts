/**
 * W-327: stylesheets (and so fonts) a host site wants the editor canvas to load before EmVB's
 * own CSS, so pages look in the editor the way the site's layout makes them look.
 *
 * Only `https:`/`http:` URLs and site paths (`/fonts.css`) are kept; anything else (`javascript:`,
 * `data:`, `//host`, relative paths) is dropped. At most 10, each at most 2048 characters.
 */
export const MAX_CANVAS_STYLES = 10;
const MAX_URL = 2048;

export function canvasStyleUrls(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const item of input) {
    if (typeof item !== "string") continue;
    const url = item.trim();
    if (!url || url.length > MAX_URL || /[\s"'<>\\]/.test(url)) continue;
    const sitePath = url.startsWith("/") && !url.startsWith("//");
    if (!sitePath && !/^https?:\/\/[^/]/i.test(url)) continue;
    if (!out.includes(url)) out.push(url);
    if (out.length === MAX_CANVAS_STYLES) break;
  }
  return out;
}
