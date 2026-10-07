import { REASONS } from "./arrange.ts";
import { isFormFieldType, isFormNode, type Layout, type LayoutNode } from "./schema/layout.ts";
import { nodeChildren } from "./tree-ops.ts";
import type { LayoutIssue } from "./validate.ts";

/**
 * Elements in a parent the editor would never let them into: a menu item outside a Menu, a tab
 * panel outside Tabs, a form field outside a form, a form in a form, and so on (W-225). The
 * same rules and messages as drag and drop (arrange.ts DROP_RULES). The editor can't build
 * these trees, but the content API accepted them and they render broken markup (an orphan
 * `<li>`, a panel no tab opens). Not part of validateLayout, so stored pages still render and
 * a copied field can still be pasted; the save hook refuses them instead.
 */
export function nestingIssues(layout: Layout, max = 5): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const add = (path: string, node: LayoutNode, reason: string) => {
    if (issues.length < max) {
      issues.push({ path, code: "nesting", message: `${reason} (${node.type} ${node.id})` });
    }
  };
  const walk = (node: LayoutNode, path: string, inForm: boolean): void => {
    const kids = nodeChildren(node);
    for (const [i, child] of kids.entries()) {
      if (issues.length >= max) return;
      const at = `${path}.children[${i}]`;
      const reason = misplaced(node, child, inForm);
      if (reason) add(at, child, reason);
      walk(child, at, inForm || isFormNode(child));
    }
  };
  walk(layout.root, "root", isFormNode(layout.root));
  return issues;
}

function misplaced(parent: LayoutNode, child: LayoutNode, inForm: boolean): string | undefined {
  if (child.type === "tab-panel" && parent.type !== "tabs") return REASONS.tabOutsideTabs;
  if (parent.type === "tabs" && child.type !== "tab-panel") return REASONS.onlyTabPanels;
  if (child.type === "accordion-item" && parent.type !== "accordion") {
    return REASONS.itemOutsideAccordion;
  }
  if (parent.type === "accordion" && child.type !== "accordion-item") {
    return REASONS.onlyAccordionItems;
  }
  if (child.type === "menu-item" && parent.type !== "menu" && parent.type !== "menu-item") {
    return REASONS.itemOutsideMenu;
  }
  if (parent.type === "menu" && child.type !== "menu-item") return REASONS.onlyMenuItems;
  if (isFormNode(child) && inForm) return REASONS.nestedForm;
  if (isFormFieldType(child.type) && !inForm) return REASONS.fieldOutsideForm;
  return undefined;
}
