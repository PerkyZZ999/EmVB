import type { PluginDescriptor } from "emdash";
import { ADMIN_ENTRY, PACKAGE_NAME, PLUGIN_ID, PLUGIN_VERSION } from "./constants.ts";
import { canvasCollectionSlugs } from "./core/canvas-collections.ts";
import { canvasStyleUrls } from "./core/canvas-styles.ts";
import { loopCollectionSlugs } from "./core/loop-collections.ts";
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
   * field (W-897). EmVB validates and guards that field on save for every collection that has it (S-08), and on agent publish for these.
   */
  canvasCollections?: string[];
  /**
   * External component providers (e.g. `"@example/emvb-provider"`) as module specifiers. On the
   * SERVER (public render) EmVB imports each one so the provider's singleton is registered and
   * `provider` nodes render. The editor is a browser bundle EmVB cannot add imports to, so to make
   * the provider's elements appear in the Add panel the host must also point `adminEntry` at a
   * wrapper that statically imports the provider and re-exports `@perkyzz/emvb/admin`.
   */
  providers?: string[];
  /**
   * Override the editor bundle module. Use with `providers`: a host wrapper that does
   * `import "@example/emvb-provider"; export * from "@perkyzz/emvb/admin";` so the provider
   * registers in the browser editor too. Defaults to `@perkyzz/emvb/admin`.
   */
  adminEntry?: string;
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
  const providers = providerSpecifiers(options.providers);
  const adminEntry =
    typeof options.adminEntry === "string" && options.adminEntry.trim()
      ? options.adminEntry.trim()
      : ADMIN_ENTRY;
  const extensions = rememberExtensions(options.extensions);
  return {
    id: PLUGIN_ID,
    version: PLUGIN_VERSION,
    format: "native",
    entrypoint: PACKAGE_NAME,
    adminEntry,
    options: {
      ...(canvasStyles.length > 0 ? { canvasStyles } : {}),
      ...(canvasCollections.length > 0 ? { canvasCollections } : {}),
      ...(providers.length > 0 ? { providers } : {}),
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

/** Keep only plausible npm/module specifiers; never emit tenant/host junk into an import(). */
function providerSpecifiers(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const value of input) {
    if (typeof value !== "string") continue;
    const s = value.trim();
    // A package name or scoped subpath: letters, digits, @, /, -, _, . — no spaces or protocol.
    if (s && /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(\/[\w.-]+)*$/i.test(s)) seen.add(s);
  }
  return [...seen];
}

// EmDash imports `createPlugin` by name from the entrypoint (1.4 and 1.5). The default export
// that repeated it was dropped in 1.2 (W-1011).
export { createPlugin };

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
