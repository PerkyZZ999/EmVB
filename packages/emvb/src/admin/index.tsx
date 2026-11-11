import type { PluginAdminExports } from "emdash";
import { installSidebarShim } from "./access/sidebar-shim.ts";
import { defaultFetcher } from "./api.ts";
import { installDialogTabWrap } from "./dialog-tab-wrap.ts";
import { EditorPage } from "./pages/EditorPage.tsx";
import { PagesPage } from "./pages/PagesPage.tsx";
import { AgentsPage } from "./pages/AgentsPage.tsx";
import { CollectionsPage } from "./pages/CollectionsPage.tsx";
import { ThemeBuilderPage } from "./pages/ThemeBuilderPage.tsx";
import { CanvasField } from "./widgets/CanvasField.tsx";
import { LayoutField } from "./widgets/LayoutField.tsx";

if (typeof document !== "undefined") {
  void installSidebarShim(document, defaultFetcher);
  // W-984: Tab stays inside EmVB dialogs.
  installDialogTabWrap(document);
}

/** `/pages`, `/theme`, `/agents` and `/collections` are declared; `/editor` renders by URL (D-024). */
export const pages: PluginAdminExports["pages"] = {
  "/pages": PagesPage,
  "/theme": ThemeBuilderPage,
  "/agents": AgentsPage,
  "/collections": CollectionsPage,
  "/editor": EditorPage,
};

export const fields: PluginAdminExports["fields"] = {
  layout: LayoutField,
  canvas: CanvasField,
};
