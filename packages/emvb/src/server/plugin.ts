import { definePlugin } from "emdash";
import { ADMIN_ENTRY, PLUGIN_ID, PLUGIN_VERSION } from "../constants.ts";
import {
  designDraftRoute,
  designPublishRoute,
  designRoute,
  designSaveRoute,
} from "./design-routes.ts";
import { iconUploadRoute, iconsRoute } from "./icon-routes.ts";
import { beforeSave } from "./hooks.ts";

export function createPlugin() {
  return definePlugin({
    id: PLUGIN_ID,
    version: PLUGIN_VERSION,
    capabilities: ["content:read", "content:write"],
    // W-239: uploaded SVG icons (EmDash's media library refuses SVG by default).
    storage: { design: { indexes: [] }, icons: { indexes: ["uploadedAt"] } },
    hooks: {
      "content:beforeSave": { handler: beforeSave, errorPolicy: "abort" },
    },
    admin: {
      entry: ADMIN_ENTRY,
      pages: [
        { path: "/pages", label: "Pages VisualBuilder", icon: "layout" },
        { path: "/theme", label: "Theme Builder", icon: "layout" },
      ],
      fieldWidgets: [{ name: "layout", label: "EmVB page (read-only)", fieldTypes: ["json"] }],
    },
    routes: {
      health: {
        public: true,
        handler: async () => ({ ok: true, plugin: PLUGIN_ID, version: PLUGIN_VERSION }),
      },
      design: designRoute,
      "design/draft": designDraftRoute,
      "design/save": designSaveRoute,
      "design/publish": designPublishRoute,
      icons: iconsRoute,
      "icons/upload": iconUploadRoute,
    },
  });
}
