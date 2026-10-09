import { isParentNode, type Layout, type LayoutNode } from "../schema/layout.ts";

/** The small scripts an EmVB page can load; everything else is plain HTML and CSS (W-311). */
export type PageScript = "forms" | "tabs" | "menu";

/** What each script is for, for badges and the performance meter (W-311). */
export const SCRIPT_LABELS: Record<PageScript, string> = {
  forms: "Form submission script",
  tabs: "Tabs keyboard script",
  menu: "Dropdown menu script",
};

/**
 * About how many bytes (minified, gzipped) each script adds (W-310). Measured from the built
 * runtimes; the forms client is the forms plugin's own script.
 */
export const SCRIPT_BYTES: Record<PageScript, number> = {
  forms: 6_000,
  tabs: 1_400,
  menu: 600,
};

/** Elements that make the page load a script by being there (W-311). */
const SCRIPT_TYPES: Partial<Record<LayoutNode["type"], PageScript>> = {
  form: "forms",
  tabs: "tabs",
};

/**
 * The script a node adds to the page, or undefined for the zero-JS default (W-311). A Menu item
 * adds the menu script only when it has a dropdown; a Form only once it is connected to a form.
 */
export function nodeScript(node: LayoutNode): PageScript | undefined {
  if (node.type === "menu-item") {
    return isParentNode(node) && node.children.length > 0 ? "menu" : undefined;
  }
  if (node.type === "form") {
    const formId = (node.props as { formId?: unknown }).formId;
    return typeof formId === "string" && formId.trim() ? "forms" : undefined;
  }
  return SCRIPT_TYPES[node.type];
}

/** Does this element type ever add a script? For the Add panel's JS badge (W-311). */
export const typeMayAddScript = (type: string): boolean =>
  type === "form" || type === "tabs" || type === "menu" || type === "menu-item";

/** Every script the layout loads, with the elements that cause it (W-311). */
export function layoutScripts(layout: Layout): Map<PageScript, string[]> {
  const found = new Map<PageScript, string[]>();
  const walk = (node: LayoutNode): void => {
    const script = nodeScript(node);
    if (script) found.set(script, [...(found.get(script) ?? []), node.id]);
    if (isParentNode(node)) for (const child of node.children) walk(child);
  };
  walk(layout.root);
  return found;
}
