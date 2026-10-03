import { EDITOR_ROLE, PLUGIN_ID } from "../../constants.ts";
import type { Fetcher } from "../api.ts";
import { readRole } from "./role.ts";

const SHIM_ID = "emvb-sidebar-shim";
const PAGES_HREF = `/_emdash/admin/plugins/${PLUGIN_ID}/pages`;
const THEME_HREF = `/_emdash/admin/plugins/${PLUGIN_ID}/theme`;
const SHIM_CSS = `.emdash-sidebar a[href$="${PAGES_HREF}"], .emdash-sidebar a[href$="${THEME_HREF}"] { display: none !important; }`;
const SECTION_LABEL = "EmVB";

let shownRole: number | null = null;

function sidebarOf(doc: Document) {
  return doc.querySelector(".emdash-sidebar");
}

function linkIn(sidebar: Element, href: string) {
  return sidebar.querySelector(`a[href$="${href}"]`);
}

/** EmDash 1.0.1 puts every plugin page in one Plugins group. Move EmVB's links into their own group. */
export function placeEmvbSection(doc: Document) {
  const sidebar = sidebarOf(doc);
  if (!sidebar) return;
  const pages = linkIn(sidebar, PAGES_HREF);
  if (!pages) return;
  const pluginsGroup = pages.closest("[data-sidebar=group]");
  if (!(pluginsGroup instanceof HTMLElement)) return;

  let section = sidebar.querySelector("[data-emvb-nav]");
  if (!(section instanceof HTMLElement)) {
    section = doc.createElement("div");
    section.setAttribute("data-sidebar", "group");
    section.setAttribute("data-emvb-nav", "");
    section.className = pluginsGroup.className;
    const existingLabel = pluginsGroup.querySelector("[data-sidebar=group-label]");
    const label =
      existingLabel instanceof HTMLElement
        ? existingLabel.cloneNode(true)
        : doc.createElement("div");
    if (label instanceof HTMLElement) {
      if (!existingLabel) label.setAttribute("data-sidebar", "group-label");
      const text = [...label.querySelectorAll("div")].find((node) => node.childElementCount === 0);
      if (text) text.textContent = SECTION_LABEL;
      else label.textContent = SECTION_LABEL;
      section.append(label);
    }
    const existingMenu = pluginsGroup.querySelector("[data-sidebar=menu]");
    const menu = doc.createElement("ul");
    menu.setAttribute("data-sidebar", "menu");
    if (existingMenu instanceof HTMLElement) menu.className = existingMenu.className;
    section.append(menu);
    pluginsGroup.before(section);
  }

  const menu = section.querySelector("[data-sidebar=menu]");
  if (!menu) return;
  for (const href of [PAGES_HREF, THEME_HREF]) {
    const link = linkIn(sidebar, href);
    const item = link?.closest("[data-sidebar=menu-item]") ?? link;
    if (item && item.parentElement !== menu) menu.append(item);
  }
}

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
 * D-024 (b), until EmDash can role-gate plugin pages: hide EmVB sidebar links below editor.
 * Cosmetic only; the pages and routes enforce access. If the role can't be read, the links
 * are shown again rather than lost for editors.
 */
function watchSidebar(doc: Document) {
  if (doc.documentElement.dataset["emvbSidebarWatch"] === "1") return;
  doc.documentElement.dataset["emvbSidebarWatch"] = "1";
  const observer = new MutationObserver((records) => {
    if (shownRole === null || shownRole < EDITOR_ROLE) return;
    const sidebar = sidebarOf(doc);
    if (!sidebar) return;
    const inside = records.some((record) => sidebar.contains(record.target));
    if (inside) placeEmvbSection(doc);
  });
  observer.observe(doc.body, { childList: true, subtree: true });
}

export async function installSidebarShim(doc: Document, fetcher: Fetcher) {
  shownRole = null;
  applySidebarShim(doc, null);
  watchSidebar(doc);
  try {
    shownRole = await readRole(fetcher);
  } catch {
    shownRole = EDITOR_ROLE;
  }
  applySidebarShim(doc, shownRole);
  if (shownRole >= EDITOR_ROLE) placeEmvbSection(doc);
}
