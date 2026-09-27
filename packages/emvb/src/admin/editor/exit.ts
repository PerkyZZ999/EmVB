import { PLUGIN_ID } from "../../constants.ts";

export const PAGES_URL = `/_emdash/admin/plugins/${PLUGIN_ID}/pages`;
const EDITOR_PATH = `/_emdash/admin/plugins/${PLUGIN_ID}/editor`;

export const editorUrl = (id: string) => `${EDITOR_PATH}?entry=${encodeURIComponent(id)}`;

/** Exit goes back to the admin page the user came from, or to Visual pages (R-001). */
export function exitTarget(referrer: string, origin: string): string {
  if (!referrer) return PAGES_URL;
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return PAGES_URL;
  }
  if (url.origin !== origin) return PAGES_URL;
  if (!url.pathname.startsWith("/_emdash/admin") || url.pathname.startsWith(EDITOR_PATH)) {
    return PAGES_URL;
  }
  return `${url.pathname}${url.search}`;
}
