import type { ImportedForm, ImportedFormField, Layout } from "../core/index.ts";
import type { LayoutNode } from "../core/schema/layout.ts";
import { ApiError, requestJson, type Fetcher } from "./api.ts";

const CREATE = "/_emdash/api/plugins/emdash-forms/forms/create";

/** A forms-plugin slug (`^[a-z][a-z0-9-]*$`, 100 at most) from a form's name, unique on the site. */
function formSlug(name: string, taken: ReadonlySet<string>): string {
  const base =
    name
      .normalize("NFKD")
      .replaceAll(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replace(/^[^a-z]+/, "")
      .replace(/-+$/, "")
      .slice(0, 90) || "imported-form";
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

/** One field as the forms plugin's `forms/create` takes it. */
function pluginField(field: ImportedFormField) {
  const validation = {
    ...(field.min === undefined ? {} : { min: field.min }),
    ...(field.max === undefined ? {} : { max: field.max }),
  };
  return {
    id: field.name,
    type: field.type,
    label: field.label,
    name: field.name,
    required: field.required,
    width: "full",
    ...(field.placeholder ? { placeholder: field.placeholder } : {}),
    ...(field.options?.length ? { options: field.options } : {}),
    ...(Object.keys(validation).length > 0 ? { validation } : {}),
  };
}

/**
 * W-1091 (#27): the body that creates an imported Elementor form in EmDash Forms (the plugin's
 * admin route, plugins:manage), or null when it has no field the plugin can hold. Pages without
 * fields are left out, since the plugin needs at least one field on each.
 */
function formCreateBody(form: ImportedForm, slug: string) {
  const pages = form.pages
    .filter((page) => page.fields.length > 0)
    .map((page) =>
      page.title
        ? { title: page.title, fields: page.fields.map(pluginField) }
        : { fields: page.fields.map(pluginField) },
    );
  if (pages.length === 0) return null;
  return {
    name: form.name,
    slug,
    pages,
    settings: {
      submitLabel: form.submitLabel,
      ...(form.successMessage ? { confirmationMessage: form.successMessage } : {}),
      ...(pages.length > 1 && form.nextLabel ? { nextLabel: form.nextLabel } : {}),
      ...(pages.length > 1 && form.prevLabel ? { prevLabel: form.prevLabel } : {}),
    },
  };
}

export type CreatedForms = {
  /** EmVB Form node id → the new forms-plugin form id. */
  ids: Map<string, string>;
  /** Forms that couldn't be made (by name), with why. */
  failed: { name: string; message: string }[];
};

/**
 * W-1091 (#27): creates each imported form in EmDash Forms, one at a time. A refusal for lack of
 * rights stops at once (nothing more would succeed) and is thrown, so the import doesn't go on
 * with a half-made set; any other failure is reported and the rest go on.
 */
export async function createImportedForms(
  fetcher: Fetcher,
  forms: readonly ImportedForm[],
  takenSlugs: ReadonlySet<string>,
): Promise<CreatedForms> {
  const taken = new Set(takenSlugs);
  const result: CreatedForms = { ids: new Map(), failed: [] };
  for (const form of forms) {
    const slug = formSlug(form.name, taken);
    taken.add(slug);
    const body = formCreateBody(form, slug);
    if (!body) {
      result.failed.push({ name: form.name, message: "it has no fields to send" });
      continue;
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- one form at a time; failures are per form
      const created = await requestJson<{ id: string }>(fetcher, CREATE, {
        method: "POST",
        body,
      });
      result.ids.set(form.nodeId, created.id);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        throw new ApiError(
          error.status,
          error.code,
          "Only administrators can create forms in EmDash Forms. Untick “Create the forms in EmDash Forms” to import without them, then connect each form in its settings.",
        );
      }
      result.failed.push({
        name: form.name,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
}

/** The layout with each created form's id on its Form element. */
export function withFormIds(layout: Layout, ids: ReadonlyMap<string, string>): Layout {
  if (ids.size === 0) return layout;
  const visit = (node: LayoutNode): LayoutNode => {
    const formId = node.type === "form" ? ids.get(node.id) : undefined;
    const children = (node as { children?: LayoutNode[] }).children;
    return {
      ...node,
      ...(formId ? { props: { ...node.props, formId } } : {}),
      ...(children ? { children: children.map(visit) } : {}),
    } as LayoutNode;
  };
  return { ...layout, root: visit(layout.root) as Layout["root"] };
}
