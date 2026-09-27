import { definePlugin } from "emdash";
import { PLUGIN_ID, PLUGIN_VERSION } from "../constants.ts";

export function createPlugin() {
  return definePlugin({
    id: PLUGIN_ID,
    version: PLUGIN_VERSION,
    capabilities: [],
    routes: {
      health: {
        public: true,
        handler: async () => ({ ok: true, plugin: PLUGIN_ID, version: PLUGIN_VERSION }),
      },
    },
  });
}
