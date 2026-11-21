import type { PluginDescriptor } from "emdash";
import { ADMIN_ENTRY, PACKAGE_NAME, PLUGIN_ID, PLUGIN_VERSION } from "./constants.ts";
import { canvasCollectionSlugs } from "./core/canvas-collections.ts";
import { canvasStyleUrls } from "./core/canvas-styles.ts";
import { loopCollectionSlugs } from "./core/loop-collections.ts";
import {
  listedExtensionManifests,
  rememberExtensions,
  type EmVBExtension,
  type ExtensionManifest,
} from "./core/extensions/index.ts";
import { astroCli, prepareExtensionBuild } from "./extension-build.ts";
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
   * field (W-897). EmVB validates and guards that field on save for every collection that has it (S-08), and on agent publish for these.
   */
  canvasCollections?: string[];
  /**
   * Build-time Extensions API v1 packages (W-927, D-066). Only the site owner adds these.
   * Live render/resolve functions are kept in-process; a serializable manifest is what
   * EmDash passes into `createPlugin`. W-1086: an extension that names its `module` is bundled
   * into the server build, and its `css` and `runtime` files are read here, at build time.
   */
  extensions?: EmVBExtension[];
  /**
   * S-10 (W-999): whether Visitors country rules may read `cf-ipcountry` and
   * `x-vercel-ip-country`. Unset, they are read only on Cloudflare Workers and Vercel, whose edge
   * sets them; elsewhere a visitor could send them. `true` trusts them (a proxy in front strips
   * client copies), `false` never reads them. Visitors rules are presentation, not access control.
   */
  trustGeoHeaders?: boolean;
  /**
   * S-11 (W-1000): the collections Loops may list on the public site, such as `["posts"]`. A
   * Loop on any other collection renders empty. Unset, Loops can list the published entries of
   * any collection, so set it if you keep a collection published but not meant to be listed.
   */
  loopCollections?: string[];
};

/** Descriptor that host sites add to `emdash({ plugins: [...] })` in astro.config. */
export function emvb(options: EmVBOptions = {}): PluginDescriptor {
  const canvasStyles = canvasStyleUrls(options.canvasStyles);
  const canvasCollections = canvasCollectionSlugs(options.canvasCollections);
  const accepted = rememberExtensions(options.extensions);
  const build =
    accepted.length > 0
      ? prepareExtensionBuild(
          accepted,
          astroCli(process.argv, process.cwd(), process.env["NODE_ENV"]),
        )
      : { warnings: [] };
  for (const warning of build.warnings) {
    // oxlint-disable-next-line no-console -- build-time notice for the site owner (W-1086)
    console.warn(`[emvb] extension ${warning}`);
  }
  const ids = new Set(accepted.map((m) => m.id));
  const extensions = listedExtensionManifests().filter((m) => ids.has(m.id));
  return {
    id: PLUGIN_ID,
    version: PLUGIN_VERSION,
    format: "native",
    // W-1086: the generated entry re-exports createPlugin after registering the extensions.
    entrypoint: build.entrypoint ?? PACKAGE_NAME,
    adminEntry: ADMIN_ENTRY,
    options: {
      ...(canvasStyles.length > 0 ? { canvasStyles } : {}),
      ...(canvasCollections.length > 0 ? { canvasCollections } : {}),
      ...(extensions.length > 0 ? { extensions } : {}),
      ...(Array.isArray(options.loopCollections)
        ? { loopCollections: loopCollectionSlugs(options.loopCollections) ?? [] }
        : {}),
      ...(typeof options.trustGeoHeaders === "boolean"
        ? { trustGeoHeaders: options.trustGeoHeaders }
        : {}),
    },
  };
}

// EmDash imports `createPlugin` by name from the entrypoint (1.4 and 1.5). The default export
// that repeated it was dropped in 1.2 (W-1011).
export { createPlugin };

/** W-1086: used by the server entry `emvb()` generates for extensions; not for site code. */
export { registerBundledExtensions } from "./core/extensions/index.ts";

export type { EmVBExtension, ExtensionManifest };
export {
  defineExtension,
  EXTENSION_API_VERSION,
  type ExtensionElement,
  type ExtensionPanel,
  type ExtensionSource,
  type ExtensionPropSchema,
  type ExtensionField,
  type ExtensionClasses,
  type ExtensionOutputNode,
} from "./core/extensions/index.ts";
