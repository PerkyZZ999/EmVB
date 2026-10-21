import type { VNode } from "../render/vnode.ts";

const URL_REF = /url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g;
const ID_LIST_ATTRS = new Set(["aria-labelledby", "aria-describedby"]);

/**
 * W-785: ids inside pasted SVG markup ("g", "a", "clip0") were rendered as-is, so two SVGs on
 * a page using the same id resolved every url(#id) and href="#id" to the first one: a second
 * gradient icon painted with the first one's colors. Prefix each internal id with the element's
 * own id and rewrite the references to it. References to ids the SVG doesn't define are left.
 */
export function scopeSvgIds(children: (VNode | string)[], prefix: string): (VNode | string)[] {
  const ids = new Set<string>();
  const collect = (node: VNode | string): void => {
    if (typeof node === "string") return;
    if (node.attrs.id) ids.add(node.attrs.id);
    node.children.forEach(collect);
  };
  children.forEach(collect);
  if (ids.size === 0) return children;
  const scoped = (id: string) => (ids.has(id) ? `${prefix}-${id}` : id);
  const rewrite = (node: VNode | string): VNode | string => {
    if (typeof node === "string") return node;
    const attrs: Record<string, string> = {};
    for (const [name, value] of Object.entries(node.attrs)) {
      if (name === "id") attrs[name] = scoped(value);
      else if ((name === "href" || name === "xlink:href") && value.startsWith("#"))
        attrs[name] = `#${scoped(value.slice(1))}`;
      else if (ID_LIST_ATTRS.has(name)) attrs[name] = value.split(/\s+/).map(scoped).join(" ");
      else
        attrs[name] = value.replace(
          URL_REF,
          (_m, q: string, id: string) => `url(${q}#${scoped(id)}${q})`,
        );
    }
    return { ...node, attrs, children: node.children.map(rewrite) };
  };
  return children.map(rewrite);
}
