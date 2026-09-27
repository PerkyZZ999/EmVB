import type { PluginAdminExports } from "emdash";
import { PagesPage } from "./pages/PagesPage.tsx";
import { LayoutField } from "./widgets/LayoutField.tsx";

export const pages: PluginAdminExports["pages"] = {
  "/pages": PagesPage,
};

export const fields: PluginAdminExports["fields"] = {
  layout: LayoutField,
};
