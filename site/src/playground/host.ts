import type { EditorHost } from "../../../packages/emvb/src/admin/editor/host.ts";

/** The project site's home page, where Exit and "Back to emvb.dev" go. */
export const SITE_HOME = "/";

/** How the editor behaves inside the playground instead of the EmDash admin. */
export const playgroundHost: EditorHost = {
  exit: () => window.location.assign(SITE_HOME),
  back: { label: "emvb.dev", go: () => window.location.assign(SITE_HOME) },
  // No EmDash admin here: links to Forms or the Theme Builder would land on a missing page (W-289).
  adminLinks: false,
  // W-321: links shared from here open in this same playground (local dev, previews, emvb.dev).
  get playgroundUrl() {
    return `${window.location.origin}/playground/`;
  },
};

/**
 * What a window narrower than the editor's 1024 px shows. "ask": the playground's notice with
 * Continue anyway. Continuing sets a 1280 px layout viewport, which phones honour (the window is
 * then wide enough and the editor opens); desktop browsers ignore it, so a narrow desktop window
 * gets "too-narrow" (how to make room) instead of the editor's dead-end notice (W-291).
 */
export function smallScreenStep(
  small: boolean,
  continued: boolean,
): "editor" | "ask" | "too-narrow" {
  if (!small) return "editor";
  return continued ? "too-narrow" : "ask";
}

/** The notice for "too-narrow": Continue anyway can't help, so it says how to make room. */
export const TOO_NARROW =
  "This window is still narrower than 1024 px, the least the editor needs. Make the window wider, or zoom the page out (Ctrl or ⌘ and −), and the editor opens.";
