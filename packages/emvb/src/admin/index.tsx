import type { PluginAdminExports } from "emdash";
import { installSidebarShim } from "./access/sidebar-shim.ts";
import { defaultFetcher } from "./api.ts";
import { EditorPage } from "./pages/EditorPage.tsx";
import { PagesPage } from "./pages/PagesPage.tsx";
import { AgentsPage } from "./pages/AgentsPage.tsx";
import { ThemeBuilderPage } from "./pages/ThemeBuilderPage.tsx";
import { CanvasField } from "./widgets/CanvasField.tsx";
import { LayoutField } from "./widgets/LayoutField.tsx";

if (typeof document !== "undefined") void installSidebarShim(document, defaultFetcher);

/** `/pages`, `/theme` and `/agents` are declared; `/editor` renders by URL (D-024). */
export const pages: PluginAdminExports["pages"] = {
  "/pages": PagesPage,
  "/theme": ThemeBuilderPage,
  "/agents": AgentsPage,
  "/editor": EditorPage,
};

export const fields: PluginAdminExports["fields"] = {
  layout: LayoutField,
  canvas: CanvasField,
};
