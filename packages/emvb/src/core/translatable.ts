import { ELEMENT_DESCRIPTORS } from "./elements/index.ts";
import type { Layout, LayoutNode } from "./schema/layout.ts";
import { forEachNode } from "./tree-ops.ts";

/** Text fields that name things rather than say things: never offered for translation. */
const NOT_TEXT = new Set(["formId", "field"]);

export type TranslatableString = { nodeId: string; key: string; text: string };

/**
 * W-936: the words a translator changes on a page: every text, textarea and list-item field of
 * every element (alt text, captions, labels and placeholders included), in page order. Ids,
 * links and form bindings are left out.
 */
export function translatableStrings(layout: Layout): TranslatableString[] {
  const out: TranslatableString[] = [];
  forEachNode(layout.root as LayoutNode, (node) => {
    const fields = ELEMENT_DESCRIPTORS.find((d) => d.type === node.type)?.fields ?? [];
    const props = (node.props ?? {}) as Record<string, unknown>;
    for (const field of fields) {
      if (NOT_TEXT.has(field.key)) continue;
      const value = props[field.key];
      if ((field.kind === "text" || field.kind === "textarea") && typeof value === "string") {
        if (value.trim()) out.push({ nodeId: node.id, key: field.key, text: value });
      } else if (field.kind === "list-items" && Array.isArray(value)) {
        value.forEach((item, i) => {
          if (typeof item === "string" && item.trim())
            out.push({ nodeId: node.id, key: `${field.key}.${i}`, text: item });
        });
      }
    }
  });
  return out;
}
