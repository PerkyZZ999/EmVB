import {
  ELEMENT_DESCRIPTORS,
  SECTION_RECIPES,
  type DesignSystem,
  type ElementType,
  type Layout,
  type LayoutNode,
} from "../../core/index.ts";
import { ELEMENT_NAMES } from "./panels/ElementPanel.tsx";
import type { PaletteItem } from "./palette.ts";

export type PaletteActions = {
  layout: Layout | null;
  design: DesignSystem;
  selected: LayoutNode | null;
  formsAvailable: boolean;
  insert: (type: ElementType) => void;
  /** Adds a section recipe (W-320). */
  insertRecipe?: (id: string) => void;
  select: (id: string) => void;
  applyClass: (nodeId: string, classId: string) => void;
  actions: { id: string; label: string; hint?: string; keywords?: string; run: () => void }[];
};

const MAX_LAYERS = 400;

function textOf(node: LayoutNode): string {
  const props = node.props as Record<string, unknown>;
  for (const key of ["text", "label", "title", "alt", "name"]) {
    const value = props[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 40);
  }
  return "";
}

/** Every palette command for the editor's current state (W-314). */
export function paletteItems(ctx: PaletteActions): PaletteItem[] {
  const items: PaletteItem[] = ctx.actions.map((action) => ({
    id: `action:${action.id}`,
    group: "Actions",
    label: action.label,
    ...(action.hint ? { hint: action.hint } : {}),
    ...(action.keywords ? { keywords: action.keywords } : {}),
    run: action.run,
  }));
  for (const descriptor of ELEMENT_DESCRIPTORS) {
    if (descriptor.type === "form" && !ctx.formsAvailable) continue;
    items.push({
      id: `insert:${descriptor.type}`,
      group: "Insert",
      label: `Insert ${descriptor.name}`,
      keywords: `${descriptor.type} ${descriptor.group}`,
      run: () => ctx.insert(descriptor.type as ElementType),
    });
  }
  const insertRecipe = ctx.insertRecipe;
  if (insertRecipe && ctx.layout) {
    for (const recipe of SECTION_RECIPES) {
      items.push({
        id: `recipe:${recipe.id}`,
        group: "Insert",
        label: `Insert ${recipe.name} section`,
        hint: "Recipe",
        keywords: `recipe section block template ${recipe.description}`,
        run: () => insertRecipe(recipe.id),
      });
    }
  }
  if (ctx.layout) {
    let count = 0;
    const walk = (node: LayoutNode, depth: number): void => {
      if (count >= MAX_LAYERS) return;
      count += 1;
      const name = node.label || ELEMENT_NAMES[node.type] || node.type;
      const text = textOf(node);
      items.push({
        id: `layer:${node.id}`,
        group: "Jump to",
        label: depth === 0 ? "Page (root)" : name,
        ...(text ? { hint: `“${text}”` } : {}),
        keywords: `${node.type} ${text}`,
        run: () => ctx.select(node.id),
      });
      if ("children" in node && Array.isArray(node.children)) {
        for (const child of node.children as LayoutNode[]) walk(child, depth + 1);
      }
    };
    walk(ctx.layout.root, 0);
  }
  const selected = ctx.selected;
  if (selected) {
    for (const cls of ctx.design.classes ?? []) {
      if (selected.classes?.includes(cls.id)) continue;
      items.push({
        id: `class:${cls.id}`,
        group: "Apply class",
        label: `Apply .${cls.name}`,
        hint: `to ${selected.label || ELEMENT_NAMES[selected.type] || selected.type}`,
        keywords: cls.id,
        run: () => ctx.applyClass(selected.id, cls.id),
      });
    }
  }
  return items;
}
