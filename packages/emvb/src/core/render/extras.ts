import type { LayoutNode } from "../schema/layout.ts";

const ATTR_NAME = /^(?:data|aria)-[a-z][a-z0-9-]{0,40}$/;

/** `data-*` and `aria-*` from Advanced. `data-emvb-*` stays reserved for the editor. */
export function customAttributes(node: LayoutNode): Record<string, string> {
  const list = node.attributes;
  if (!list) return {};
  const attrs: Record<string, string> = {};
  const seen = new Set<string>();
  for (const item of list) {
    if (!ATTR_NAME.test(item.name) || item.name.startsWith("data-emvb")) continue;
    if (seen.has(item.name) || item.value.length > 200) continue;
    if ([...item.value].some((char) => char.charCodeAt(0) < 32)) continue;
    seen.add(item.name);
    attrs[item.name] = item.value;
  }
  return attrs;
}
