import { EDITOR_ROLE, PLUGIN_ID } from "../../constants.ts";
import type { Fetcher } from "../api.ts";
import { readRole } from "./role.ts";

const SHIM_ID = "emvb-sidebar-shim";
const PAGES_HREF = `/_emdash/admin/plugins/${PLUGIN_ID}/pages`;
const SHIM_CSS = `.emdash-sidebar a[href$="${PAGES_HREF}"] { display: none !important; }`;

/** `null` means the role isn't known yet: the link stays hidden so it never flashes for lower roles. */
export function applySidebarShim(doc: Document, role: number | null) {
  const existing = doc.getElementById(SHIM_ID);
  if (role !== null && role >= EDITOR_ROLE) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const style = doc.createElement("style");
  style.id = SHIM_ID;
  style.textContent = SHIM_CSS;
  doc.head.append(style);
}

/**
 * D-024 (b), until EmDash can role-gate plugin pages: hide the "Visual pages" sidebar link below
 * editor. Cosmetic only; the pages and routes enforce access. If the role can't be read, the link
 * is shown again rather than lost for editors.
 */
export async function installSidebarShim(doc: Document, fetcher: Fetcher) {
  applySidebarShim(doc, null);
  try {
    applySidebarShim(doc, await readRole(fetcher));
  } catch {
    applySidebarShim(doc, EDITOR_ROLE);
  }
}
