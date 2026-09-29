import type { LayoutNode } from "../../../../core/index.ts";

export const propsOf = (node: LayoutNode): Record<string, unknown> =>
  node.props as Record<string, unknown>;

export const withProp = (node: LayoutNode, key: string, value: unknown): LayoutNode => {
  const props = { ...propsOf(node) };
  if (value === undefined) delete props[key];
  else props[key] = value;
  return { ...node, props } as LayoutNode;
};
