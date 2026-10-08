import type { EditorHost } from "../../../packages/emvb/src/admin/editor/host.ts";

/** The project site's home page, where Exit and "Back to emvb.dev" go. */
export const SITE_HOME = "/";

/** How the editor behaves inside the playground instead of the EmDash admin. */
export const playgroundHost: EditorHost = {
  exit: () => window.location.assign(SITE_HOME),
  back: { label: "emvb.dev", go: () => window.location.assign(SITE_HOME) },
  // No EmDash admin here: links to Forms or the Theme Builder would land on a missing page (W-289).
  adminLinks: false,
};
