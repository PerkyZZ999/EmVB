import type { DesignSystem } from "../schema/design.ts";

/** W-1067: where a Theme toggle keeps the visitor's light or dark choice in this browser. */
export const THEME_STORAGE_KEY = "emvb-theme";

/**
 * W-1067: puts back a saved light or dark choice before the page is drawn. The opt-in Theme
 * toggle script runs after the first paint and only on pages with a toggle, so a saved choice
 * flashed the system's look first and was ignored on pages without one. Inline and constant, so
 * a site with a Content Security Policy can allow it by its hash (docs/guides/widgets.md).
 */
export const THEME_BOOT_SCRIPT = `<script>try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-emvb-theme",t)}catch(e){}</script>`;

/** Whether the design has any dark colour value, and so a light or dark choice to put back. */
export const designHasDark = (design: DesignSystem): boolean =>
  (design.variables?.colors ?? []).some((color) => typeof color.dark === "string");
