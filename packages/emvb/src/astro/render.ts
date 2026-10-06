import type { PublicPluginApiRouteHandler } from "emdash/plugin-utils";
import {
  emptyDesign,
  renderPage,
  validateDesign,
  validateLayout,
  type DesignSystem,
  type FormDefinitions,
  type Layout,
  type ThemeDynamicData,
} from "../core/index.ts";
import { PLUGIN_ID } from "../constants.ts";

export type RenderedPage = {
  html: string;
  css: string;
  needsFormsRuntime: boolean;
  needsTabsRuntime: boolean;
};

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

/** Where a stored layout first fails: a structural path and an issue code, never content (W-182). */
type UnreadableLayout = { path: string; code: string };

/** A stored layout (EmDash may hand back json fields as strings), upgraded and validated. */
function inspectLayout(
  raw: unknown,
): { layout: Layout; problem?: undefined } | { layout: null; problem: UnreadableLayout } {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return { layout: null, problem: { path: "", code: "invalid_json" } };
    }
  }
  const result = validateLayout(value);
  if (result.ok) return { layout: result.layout };
  const first = result.issues[0];
  return { layout: null, problem: { path: first?.path ?? "", code: first?.code ?? "invalid" } };
}

/** A stored layout, upgraded and validated, or null when it is unreadable. */
export function readLayout(raw: unknown): Layout | null {
  return inspectLayout(raw).layout;
}

/** Public HTML and CSS for a stored layout. An unreadable layout renders empty (R-033). */
export function renderStored(
  raw: unknown,
  design: DesignSystem,
  pageId: string,
  formDefinitions?: FormDefinitions,
  dynamic?: ThemeDynamicData,
): RenderedPage {
  const { layout, problem } = inspectLayout(raw);
  if (!layout) {
    if (raw !== null && raw !== undefined && raw !== "") {
      // Public renders have no plugin logger. The page id and where the layout first fails
      // (a structural path and an issue code), never layout content or issue messages (W-182).
      // oxlint-disable-next-line no-console
      console.error("emvb: stored layout is unreadable", { pageId, ...problem });
    }
    return { html: "", css: "", needsFormsRuntime: false, needsTabsRuntime: false };
  }
  const { html, css, needsFormsRuntime, needsTabsRuntime } = renderPage(layout, design, {
    formDefinitions,
    dynamic,
    scope: pageId,
  });
  return { html, css, needsFormsRuntime, needsTabsRuntime };
}
