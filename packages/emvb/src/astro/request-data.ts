import { getSiteSettings } from "emdash";
import {
  layoutUsesSource,
  paramsFromSearch,
  siteBindingValues,
  type Layout,
} from "../core/index.ts";

/** Live values a layout's bindings need on this request: site settings and URL parameters. */
export async function bindingDataFor(
  layout: Layout | null,
  url: URL,
): Promise<{ site?: Record<string, string>; params?: Record<string, string> }> {
  if (!layout) return {};
  const data: { site?: Record<string, string>; params?: Record<string, string> } = {};
  if (layoutUsesSource(layout.root, "param")) data.params = paramsFromSearch(url.searchParams);
  if (layoutUsesSource(layout.root, "site")) {
    try {
      data.site = siteBindingValues(await getSiteSettings());
    } catch {
      data.site = {};
    }
  }
  return data;
}
