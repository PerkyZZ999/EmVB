import type { PublicPluginApiRouteHandler } from "emdash/plugin-utils";
import {
  isFormNode,
  type FormDefinitions,
  type Layout,
  type LayoutNode,
  type PublicFormDefinition,
  type PublicFormField,
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isOption = (value: unknown): value is { label: string; value: string } =>
  isRecord(value) && typeof value.label === "string" && typeof value.value === "string";

/** Only the numbers and pattern the renderer sets on the control; the rest is dropped. */
function asValidation(value: unknown): PublicFormField["validation"] | undefined {
  if (!isRecord(value)) return undefined;
  const number = (key: string): number | undefined =>
    typeof value[key] === "number" && Number.isFinite(value[key])
      ? (value[key] as number)
      : undefined;
  const validation: NonNullable<PublicFormField["validation"]> = {};
  const minLength = number("minLength");
  const maxLength = number("maxLength");
  const min = number("min");
  const max = number("max");
  if (minLength !== undefined) validation.minLength = minLength;
  if (maxLength !== undefined) validation.maxLength = maxLength;
  if (min !== undefined) validation.min = min;
  if (max !== undefined) validation.max = max;
  if (typeof value.pattern === "string") validation.pattern = value.pattern;
  return Object.keys(validation).length > 0 ? validation : undefined;
}

/** A field the renderer can use, or null; options that aren't label/value text are left out. */
function asField(value: unknown): PublicFormField | null {
  if (!isRecord(value) || typeof value.name !== "string") return null;
  const field: PublicFormField = {
    ...value,
    name: value.name,
    type: typeof value.type === "string" ? value.type : "",
    label: typeof value.label === "string" ? value.label : value.name,
    required: value.required === true,
  };
  if (Array.isArray(value.options)) field.options = value.options.filter(isOption);
  else delete field.options;
  if (typeof value.placeholder !== "string") delete field.placeholder;
  field.validation = asValidation(value.validation);
  if (!field.validation) delete field.validation;
  return field;
}

/**
 * The plugin's answer as a definition the core renderer can trust. The route is another plugin's
 * code, so missing `settings`, odd pages or fields are normalised here rather than crashing the
 * public render (W-092).
 */
function asDefinition(payload: unknown): PublicFormDefinition | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as { success?: boolean; data?: unknown };
  const data = body.success === true ? body.data : payload;
  if (!data || typeof data !== "object") return null;
  const def = data as Record<string, unknown>;
  if (!Array.isArray(def.pages)) return null;
  const rawPages: unknown[] = Array.isArray(def.pages) ? def.pages : [];
  const pages = rawPages.filter(isRecord).map((page) =>
    Object.assign({}, page, {
      fields: Array.isArray(page.fields)
        ? page.fields.map(asField).filter((field) => field !== null)
        : [],
    }),
  );
  const rawSettings = isRecord(def.settings) ? def.settings : {};
  const settings: PublicFormDefinition["settings"] = { ...rawSettings };
  if (typeof rawSettings.submitLabel !== "string") delete settings.submitLabel;
  if (typeof rawSettings.spamProtection !== "string") delete settings.spamProtection;
  return { ...(def as PublicFormDefinition), pages, settings };
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
