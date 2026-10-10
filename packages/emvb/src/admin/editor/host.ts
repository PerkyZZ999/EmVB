import * as React from "react";
import { PLUGIN_ID } from "../../constants.ts";
import { canvasStyleUrls } from "../../core/canvas-styles.ts";
import { requestJson, type Fetcher } from "../api.ts";
import { exitTarget, PAGES_URL } from "./exit.ts";

/**
 * Where the editor sends someone who leaves it. The EmDash admin is the default; a host that
 * embeds the editor somewhere else (the emvb.dev playground) provides its own.
 */
export type EditorHost = {
  /** Exit, and Discard or Save and leave in the Leave dialog. */
  exit: () => void;
  /** The way back when the editor can't open here (small screen, missing page). */
  back: { label: string; go: () => void };
  /**
   * Whether panels link to other EmDash admin screens (Forms, Theme Builder). A host without the
   * admin (the playground) sets false, so those links don't lead nowhere (W-289). Default true.
   */
  adminLinks?: boolean;
  /** Where shared page links open (W-321). Default emvb.dev/playground. */
  playgroundUrl?: string;
  /**
   * Stylesheets the canvas loads before EmVB's CSS (W-327). Unset: the editor asks the plugin
   * for the host's `emvb({ canvasStyles })`.
   */
  canvasStyles?: readonly string[];
};

const defaultEditorHost: EditorHost = {
  exit: () => window.location.assign(exitTarget(document.referrer, window.location.origin)),
  back: { label: "Visual pages", go: () => window.location.assign(PAGES_URL) },
};

export const EditorHostContext = React.createContext<EditorHost>(defaultEditorHost);

export const useEditorHost = (): EditorHost => React.useContext(EditorHostContext);

/** False when the editor runs outside the EmDash admin, where admin links would lead nowhere. */
export const useAdminLinks = (): boolean => useEditorHost().adminLinks !== false;

/**
 * W-327: the host's canvas stylesheets, from the EditorHost or else the plugin's
 * `editor/config` route. Empty while loading and when the route fails.
 */
export function useCanvasStyles(fetcher: Fetcher): readonly string[] {
  const provided = useEditorHost().canvasStyles;
  const [loaded, setLoaded] = React.useState<readonly string[]>([]);
  React.useEffect(() => {
    if (provided) return;
    let cancelled = false;
    void requestJson<{ canvasStyles?: unknown }>(
      fetcher,
      `/_emdash/api/plugins/${PLUGIN_ID}/editor/config`,
    )
      .then((body) => {
        if (!cancelled) setLoaded(canvasStyleUrls(body?.canvasStyles));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fetcher, provided]);
  return provided ? canvasStyleUrls(provided) : loaded;
}
