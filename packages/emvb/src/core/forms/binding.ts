import { isFormNode, type Layout, type LayoutNode } from "../schema/layout.ts";
import { nodeChildren } from "../tree-ops.ts";
import { fieldsOf, type FormDefinitions } from "./definition.ts";

export type MissingRequiredField = {
  formNodeId: string;
  formId: string;
  field: string;
};

function walk(node: LayoutNode, visit: (node: LayoutNode) => void): void {
  visit(node);
  for (const child of nodeChildren(node)) walk(child, visit);
}

function boundFields(form: LayoutNode): Set<string> {
  const names = new Set<string>();
  walk(form, (node) => {
    if (
      node.type === "text-input" ||
      node.type === "textarea" ||
      node.type === "select" ||
      node.type === "checkbox" ||
      node.type === "radio"
    ) {
      const field = (node.props as { field?: string }).field;
      if (field) names.add(field);
    }
  });
  return names;
}

/**
 * Required fields on the forms-plugin definition that have no EmVB input bound (R-040).
 */
export function findMissingRequiredFields(
  layout: Layout,
  definitions: FormDefinitions,
): MissingRequiredField[] {
  const missing: MissingRequiredField[] = [];
  walk(layout.root, (node) => {
    if (!isFormNode(node) || !node.props.formId) return;
    const definition = definitions.get(node.props.formId);
    if (!definition) return;
    const bound = boundFields(node);
    for (const field of fieldsOf(definition)) {
      if (field.required && !bound.has(field.name)) {
        missing.push({ formNodeId: node.id, formId: node.props.formId, field: field.name });
      }
    }
  });
  return missing;
}

export function layoutHasForm(layout: Layout): boolean {
  let found = false;
  walk(layout.root, (node) => {
    if (isFormNode(node) && node.props.formId.trim()) found = true;
  });
  return found;
}
