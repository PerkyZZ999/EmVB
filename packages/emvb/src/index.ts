import type { PluginDescriptor } from "emdash";
import { ADMIN_ENTRY, PACKAGE_NAME, PLUGIN_ID, PLUGIN_VERSION } from "./constants.ts";
import { canvasCollectionSlugs } from "./core/canvas-collections.ts";
import { canvasStyleUrls } from "./core/canvas-styles.ts";
import {
  rememberExtensions,
  type EmVBExtension,
  type ExtensionManifest,
} from "./core/extensions/index.ts";
import { createPlugin } from "./server/plugin.ts";

/** Options a host site passes to `emvb()` in astro.config. */
export type EmVBOptions = {
  /**
   * Stylesheets the editor canvas loads before EmVB's CSS (W-327): the site's fonts and base
   * styles, so pages look in the editor as on the site. `https:` URLs or site paths
   * (`/styles/site.css`); anything else is ignored.
   */
  canvasStyles?: string[];
  /**
   * Host collections (such as `pages`) whose entries can hold an `emvb:canvas` "Edit with EmVB"
   * field (W-897). EmVB validates and guards that field on save and publish for these only.
   */
  canvasCollections?: string[];
  /**
   * Build-time Extensions API v1 packages (W-927, D-066). Only the site owner adds these.
   * Live render/resolve functions are kept in-process; a serializable manifest is what
   * EmDash passes into `createPlugin`.
   */
  extensions?: EmVBExtension[];
  /**
   * S-10 (W-999): whether Visitors country rules may read `cf-ipcountry` and
   * `x-vercel-ip-country`. Unset, they are read only on Cloudflare Workers and Vercel, whose edge
   * sets them; elsewhere a visitor could send them. `true` trusts them (a proxy in front strips
   * client copies), `false` never reads them. Visitors rules are presentation, not access control.
   */
  trustGeoHeaders?: boolean;
};

/** Descriptor that host sites add to `emdash({ plugins: [...] })` in astro.config. */
export function emvb(options: EmVBOptions = {}): PluginDescriptor {
  const canvasStyles = canvasStyleUrls(options.canvasStyles);
  const canvasCollections = canvasCollectionSlugs(options.canvasCollections);
  const extensions = rememberExtensions(options.extensions);
  return {
    id: PLUGIN_ID,
    version: PLUGIN_VERSION,
    format: "native",
    entrypoint: PACKAGE_NAME,
    adminEntry: ADMIN_ENTRY,
    options: {
      ...(canvasStyles.length > 0 ? { canvasStyles } : {}),
      ...(canvasCollections.length > 0 ? { canvasCollections } : {}),
      ...(extensions.length > 0 ? { extensions } : {}),
      ...(typeof options.trustGeoHeaders === "boolean"
        ? { trustGeoHeaders: options.trustGeoHeaders }
        : {}),
    },
  };
}

export { createPlugin };
export default createPlugin;

export type { EmVBExtension, ExtensionManifest };
export {
  defineExtension,
  EXTENSION_API_VERSION,
  type ExtensionElement,
  type ExtensionPanel,
  type ExtensionSource,
  type ExtensionPropSchema,
  type ExtensionField,
} from "./core/extensions/index.ts";
