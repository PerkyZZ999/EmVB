import {
  proposalCreateRoute,
  proposalGetRoute,
  proposalsRoute,
  proposalWithdrawRoute,
} from "./proposals.ts";
import { definePlugin } from "emdash";
import { ADMIN_ENTRY, PLUGIN_ID, PLUGIN_VERSION } from "../constants.ts";
import {
  designDraftRoute,
  designPublishRoute,
  designRoute,
  designSaveRoute,
} from "./design-routes.ts";
import {
  savedSectionDeleteRoute,
  savedSectionGetRoute,
  savedSectionRenameRoute,
  savedSectionSaveRoute,
  savedSectionsRoute,
} from "./saved-sections.ts";
import { iconDeleteRoute, iconRenameRoute, iconUploadRoute, iconsRoute } from "./icon-routes.ts";
import { beforeSave } from "./hooks.ts";
import {
  agentsRoute,
  agentsSaveRoute,
  beforePublish,
  pageAgentVersionsRoute,
} from "./agent-settings.ts";
import { canvasStyleUrls } from "../core/canvas-styles.ts";
import { canvasCollectionSlugs } from "../core/canvas-collections.ts";
import { manifestsFromOptions } from "../core/extensions/index.ts";
import { TOOLS } from "../mcp/tools.ts";
import { mcpRoutes, mcpToolConfig } from "./mcp-routes.ts";

export function createPlugin(
  options: {
    canvasStyles?: unknown;
    canvasCollections?: unknown;
    extensions?: unknown;
  } = {},
) {
  const canvasStyles = canvasStyleUrls(options.canvasStyles);
  const canvasCollections = canvasCollectionSlugs(options.canvasCollections);
  const extensions = manifestsFromOptions(options.extensions);
  return definePlugin({
    id: PLUGIN_ID,
    version: PLUGIN_VERSION,
    capabilities: [
      "content:read",
      // W-898: find host fields that use the emvb:canvas widget.
      "schema:read",
      "content:write",
      "content:publish",
      "content:revisions:read",
      "hooks.content-policy:register",
    ],
    // W-239: uploaded SVG icons (EmDash's media library refuses SVG by default).
    storage: {
      design: { indexes: [] },
      icons: { indexes: ["uploadedAt"] },
      // D-057: agent changes and the site styles history.
      agentlog: { indexes: ["at", "pageId"] },
      designhistory: { indexes: ["at"] },
      // W-875 (D-060): saved sections, by name, per site.
      emvb_saved_sections: { indexes: ["updatedAt"] },
      emvb_proposals: { indexes: ["createdAt"] },
    },
    hooks: {
      "content:beforeSave": {
        handler: (event, ctx) => beforeSave(event, ctx, canvasCollections),
        errorPolicy: "abort",
      },
      // D-055: EmDash's own MCP tools can't publish EmVB pages unless the admin allowed it.
      "content:beforePublish": {
        handler: (event, ctx) => beforePublish(event, ctx, canvasCollections),
      },
    },
    admin: {
      entry: ADMIN_ENTRY,
      pages: [
        { path: "/pages", label: "Pages VisualBuilder", icon: "layout" },
        { path: "/theme", label: "Theme Builder", icon: "layout" },
        { path: "/agents", label: "AI agents", icon: "layout" },
        { path: "/collections", label: "Host collections", icon: "layout" },
      ],
      fieldWidgets: [
        { name: "layout", label: "EmVB page (read-only)", fieldTypes: ["json"] },
        { name: "canvas", label: "Edit with EmVB", fieldTypes: ["json"] },
      ],
    },
    routes: {
      health: {
        public: true,
        handler: async () => ({ ok: true, plugin: PLUGIN_ID, version: PLUGIN_VERSION }),
      },
      // W-327: what the editor needs from the host's `emvb()` options.
      "editor/config": {
        handler: async () => ({
          canvasStyles,
          canvasCollections,
          extensions,
        }),
      },
      design: designRoute,
      "design/draft": designDraftRoute,
      "design/save": designSaveRoute,
      "design/publish": designPublishRoute,
      icons: iconsRoute,
      "saved-sections": savedSectionsRoute,
      proposals: proposalsRoute,
      "proposals/get": proposalGetRoute,
      "proposals/create": proposalCreateRoute,
      "proposals/withdraw": proposalWithdrawRoute,
      "saved-sections/get": savedSectionGetRoute,
      "saved-sections/save": savedSectionSaveRoute,
      "saved-sections/rename": savedSectionRenameRoute,
      "saved-sections/delete": savedSectionDeleteRoute,
      "icons/upload": iconUploadRoute,
      "icons/rename": iconRenameRoute,
      "icons/delete": iconDeleteRoute,
      // W-463: the Agents tab (admins only).
      agents: agentsRoute,
      "agents/save": agentsSaveRoute,
      "agents/page": pageAgentVersionsRoute,
      // R1 D-054: EmDash's /_emdash/api/mcp lists these as emvb__<tool> (EmDash 1.2+, mcp: true).
      ...mcpRoutes(TOOLS),
    },
    mcp: mcpToolConfig(TOOLS),
  });
}
