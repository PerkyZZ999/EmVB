import type { PluginAdminExports } from "emdash";
import { installSidebarShim } from "./access/sidebar-shim.ts";
import { defaultFetcher } from "./api.ts";
import { EditorPage } from "./pages/EditorPage.tsx";
import { PagesPage } from "./pages/PagesPage.tsx";
import { LayoutField } from "./widgets/LayoutField.tsx";

if (typeof document !== "undefined") void installSidebarShim(document, defaultFetcher);

/** Only `/pages` is declared in the plugin descriptor; `/editor` renders by URL (D-024). */
export const pages: PluginAdminExports["pages"] = {
  "/pages": PagesPage,
  "/editor": EditorPage,
};

export const fields: PluginAdminExports["fields"] = {
  layout: LayoutField,
};
