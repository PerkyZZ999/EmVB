import type { PublicPluginApiRouteHandler } from "emdash/plugin-utils";
import {
  emptyDesign,
  renderPage,
  validateDesign,
  validateLayout,
  type DesignSystem,
  type FormDefinitions,
  type Layout,
} from "../core/index.ts";
import { PLUGIN_ID } from "../constants.ts";

export type RenderedPage = { html: string; css: string; needsFormsRuntime: boolean };

/** The design document through the in-process public route (no HTTP round trip, D-013). */
export async function loadDesign(
  handler: PublicPluginApiRouteHandler | undefined,
  base: URL,
): Promise<DesignSystem> {
  if (!handler) return emptyDesign();
  try {
    const request = new Request(new URL(`/_emdash/api/plugins/${PLUGIN_ID}/design`, base));
    const response = await handler(PLUGIN_ID, "GET", "/design", request);
    const result = validateDesign((response.data as { design?: unknown } | undefined)?.design);
    return result.ok ? result.design : emptyDesign();
  } catch {
    return emptyDesign();
  }
}

/** A stored layout (EmDash may hand back json fields as strings), upgraded and validated. */
export function readLayout(raw: unknown): Layout | null {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  const result = validateLayout(value);
  return result.ok ? result.layout : null;
}

/** Public HTML and CSS for a stored layout. An unreadable layout renders empty (R-033). */
export function renderStored(
  raw: unknown,
  design: DesignSystem,
  pageId: string,
  formDefinitions?: FormDefinitions,
): RenderedPage {
  const layout = readLayout(raw);
  if (!layout) {
    if (raw !== null && raw !== undefined && raw !== "") {
      // Public renders have no plugin logger. The page id only, never layout content.
      // oxlint-disable-next-line no-console
      console.error("emvb: stored layout is unreadable", { pageId });
    }
    return { html: "", css: "", needsFormsRuntime: false };
  }
  const { html, css, needsFormsRuntime } = renderPage(layout, design, { formDefinitions });
  return { html, css, needsFormsRuntime };
}
