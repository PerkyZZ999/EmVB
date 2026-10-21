import {
  ELEMENT_DESCRIPTORS,
  SECTION_RECIPES,
  clipText,
  type DesignSystem,
  type ElementType,
  type Layout,
  type LayoutNode,
} from "../../core/index.ts";
import { ELEMENT_NAMES } from "./element-chrome.ts";
import type { PaletteItem } from "./palette.ts";

export type PaletteActions = {
  layout: Layout | null;
  design: DesignSystem;
  selected: LayoutNode | null;
  formsAvailable: boolean;
  insert: (type: ElementType) => void;
  /** Adds a section recipe (W-320). */
  insertRecipe?: (id: string) => void;
  /** My sections (W-876), inserted by id. */
  savedSections?: readonly { id: string; name: string; damaged?: true }[];
  insertSaved?: (id: string) => void;
  select: (id: string) => void;
  applyClass: (nodeId: string, classId: string) => void;
  actions: { id: string; label: string; hint?: string; keywords?: string; run: () => void }[];
};

const MAX_LAYERS = 400;

const TEXT_KEYS = [
  "text",
  "label",
  "title",
  "alt",
  "name",
  "summary",
  "caption",
  "placeholder",
] as const;

/** Visible copy on a node, including accordion and tab labels, for Find text (W-339). */
function textOf(node: LayoutNode): string {
  const props = node.props as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of TEXT_KEYS) {
    const value = props[key];
    if (typeof value === "string" && value.trim()) parts.push(value.trim());
  }
  const items = props["items"];
  if (Array.isArray(items)) {
    for (const item of items) {
      // W-618: a List's items are plain strings.
      if (typeof item === "string") {
        if (item.trim()) parts.push(item.trim());
        continue;
      }
      if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
        parts.push(item.text.trim());
      }
    }
  }
  // W-556: the whole text, so Find text finds a word near the end of a long paragraph.
  return parts.join(" ").replace(/\s+/g, " ");
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
  const insertSaved = ctx.insertSaved;
  if (insertSaved) {
    for (const section of ctx.savedSections ?? []) {
      if (section.damaged) continue;
      items.push({
        id: `saved:${section.id}`,
        group: "Insert",
        label: `Insert ${section.name}`,
        hint: "My sections",
        keywords: "my sections saved section block template segment",
        run: () => insertSaved(section.id),
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
        ...(text ? { hint: `“${clipText(text, 40)}”` } : {}),
        keywords: `${node.type} ${text}`,
        run: () => ctx.select(node.id),
      });
      if (text && depth > 0) {
        items.push({
          id: `find:${node.id}`,
          group: "Find text",
          label: text.length > 80 ? `${clipText(text, 77)}…` : text,
          hint: name,
          keywords: text,
          run: () => ctx.select(node.id),
        });
      }
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
