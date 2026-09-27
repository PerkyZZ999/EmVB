import type { PluginDescriptor } from "emdash";
import { PACKAGE_NAME, PLUGIN_ID, PLUGIN_VERSION } from "./constants.ts";
import { createPlugin } from "./server/plugin.ts";

/** Descriptor that host sites add to `emdash({ plugins: [...] })` in astro.config. */
export function emvb(): PluginDescriptor {
  return {
    id: PLUGIN_ID,
    version: PLUGIN_VERSION,
    format: "native",
    entrypoint: PACKAGE_NAME,
    options: {},
  };
}

export { createPlugin };
export default createPlugin;
