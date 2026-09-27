import { definePlugin } from "emdash";
import { PLUGIN_ID, PLUGIN_VERSION } from "../constants.ts";
import { designRoute, designSaveRoute } from "./design-routes.ts";
import { beforeSave } from "./hooks.ts";

export function createPlugin() {
  return definePlugin({
    id: PLUGIN_ID,
    version: PLUGIN_VERSION,
    capabilities: ["content:read", "content:write"],
    storage: { design: { indexes: [] } },
    hooks: {
      "content:beforeSave": { handler: beforeSave, errorPolicy: "abort" },
    },
    routes: {
      health: {
        public: true,
        handler: async () => ({ ok: true, plugin: PLUGIN_ID, version: PLUGIN_VERSION }),
      },
      design: designRoute,
      "design/save": designSaveRoute,
    },
  });
}
