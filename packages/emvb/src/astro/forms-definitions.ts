import type { PublicPluginApiRouteHandler } from "emdash/plugin-utils";
import {
  isFormNode,
  type FormDefinitions,
  type Layout,
  type LayoutNode,
  type PublicFormDefinition,
} from "../core/index.ts";
import { nodeChildren } from "../core/tree-ops.ts";

const FORMS_PLUGIN = "emdash-forms";

function walk(node: LayoutNode, visit: (node: LayoutNode) => void): void {
  visit(node);
  for (const child of nodeChildren(node)) walk(child, visit);
}

export function formIdsInLayout(layout: Layout): string[] {
  const ids = new Set<string>();
  walk(layout.root, (node) => {
    if (isFormNode(node) && node.props.formId) ids.add(node.props.formId);
  });
  return [...ids];
}

function asDefinition(payload: unknown): PublicFormDefinition | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as { success?: boolean; data?: unknown };
  const data = body.success === true ? body.data : payload;
  if (!data || typeof data !== "object") return null;
  const def = data as PublicFormDefinition;
  if (!Array.isArray(def.pages)) return null;
  return def;
}

/** Loads public form definitions in-process (D-015). Missing forms are omitted. */
export async function loadFormDefinitions(
  handler: PublicPluginApiRouteHandler | undefined,
  base: URL,
  formIds: readonly string[],
): Promise<FormDefinitions> {
  const map = new Map<string, PublicFormDefinition>();
  if (!handler || formIds.length === 0) return map;
  await Promise.all(
    formIds.map(async (formId) => {
      try {
        const request = new Request(
          new URL(`/_emdash/api/plugins/${FORMS_PLUGIN}/definition`, base),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: formId }),
          },
        );
        const response = await handler(FORMS_PLUGIN, "POST", "/definition", request);
        const def = asDefinition(response);
        if (def) map.set(formId, def);
      } catch {
        // Forms plugin missing or form unknown — render without definition options.
      }
    }),
  );
  return map;
}
