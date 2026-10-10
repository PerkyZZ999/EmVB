import type { PluginDescriptor } from "emdash";
import { ADMIN_ENTRY, PACKAGE_NAME, PLUGIN_ID, PLUGIN_VERSION } from "./constants.ts";
import { canvasStyleUrls } from "./core/canvas-styles.ts";
import { createPlugin } from "./server/plugin.ts";

/** Options a host site passes to `emvb()` in astro.config. */
export type EmVBOptions = {
  /**
   * Stylesheets the editor canvas loads before EmVB's CSS (W-327): the site's fonts and base
   * styles, so pages look in the editor as on the site. `https:` URLs or site paths
   * (`/styles/site.css`); anything else is ignored.
   */
  canvasStyles?: string[];
};

/** Descriptor that host sites add to `emdash({ plugins: [...] })` in astro.config. */
export function emvb(options: EmVBOptions = {}): PluginDescriptor {
  const canvasStyles = canvasStyleUrls(options.canvasStyles);
  return {
    id: PLUGIN_ID,
    version: PLUGIN_VERSION,
    format: "native",
    entrypoint: PACKAGE_NAME,
    adminEntry: ADMIN_ENTRY,
    options: canvasStyles.length > 0 ? { canvasStyles } : {},
  };
}

export { createPlugin };
export default createPlugin;
