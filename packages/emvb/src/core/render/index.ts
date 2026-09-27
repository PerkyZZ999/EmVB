import { generateCss } from "../css/generate.ts";
import { ELEMENTS } from "../elements/index.ts";
import type { DesignSystem } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { cssLength, styleDeclarations, type Declaration } from "../sanitize/css.ts";
import { serialize, type VNode } from "./vnode.ts";

export type RenderMode = "public" | "editor";
export type RenderWarning = {
  nodeId: string;
  code: "unknown-type" | "rejected-style" | "unknown-variable";
  detail: string;
};
export type RenderResult = {
  vnode: VNode;
  html: string;
  css: string;
  needsFormsRuntime: boolean;
  warnings: RenderWarning[];
};

const ID = /^[A-Za-z0-9_-]{4,24}$/;
const HTML_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/**
 * Renders a validated layout to lean HTML and CSS (R-031, R-032). Walks defensively: unknown types
 * render nothing publicly and a placeholder in the editor (R-033); unsafe style values are dropped.
 */
export function renderPage(
  layout: Layout,
  design: DesignSystem,
  opts: { mode?: RenderMode } = {},
): RenderResult {
  const mode = opts.mode ?? "public";
  const warnings: RenderWarning[] = [];
  const usedTypes = new Set<string>();
  const localRules: { id: string; declarations: Declaration[] }[] = [];
  const knownVariables = new Set(design.variables.colors.map((c) => c.id));

  const visit = (node: LayoutNode, isRoot: boolean): VNode | undefined => {
    const id = ID.test(node.id) ? node.id : undefined;
    const nodeId = id ?? "(invalid id)";
    const type: string = node.type;
    if (!Object.hasOwn(ELEMENTS, type)) {
      warnings.push({ nodeId, code: "unknown-type", detail: type });
      if (mode === "public") return undefined;
      return {
        tag: "div",
        attrs: { class: "emvb-unknown", ...(id ? { "data-emvb-id": id } : {}) },
        children: [`Unknown element "${type}"`],
      };
    }
    usedTypes.add(type);
    const classes = [...(isRoot ? ["emvb-root"] : []), `emvb-${type}`];
    const { declarations, rejected } = styleDeclarations(node.style);
    for (const key of rejected) warnings.push({ nodeId, code: "rejected-style", detail: key });
    if (node.type === "spacer") {
      const height = cssLength(node.props.height);
      if (height) declarations.push({ property: "height", value: height });
    }
    const color = node.style?.color;
    if (typeof color === "object" && !knownVariables.has(color.var)) {
      warnings.push({ nodeId, code: "unknown-variable", detail: color.var });
    }
    if (id && declarations.length > 0) {
      classes.push(`emvb-e-${id}`);
      localRules.push({ id, declarations });
    }
    const attrs: Record<string, string> = { class: classes.join(" ") };
    if (mode === "editor" && id) attrs["data-emvb-id"] = id;
    if (node.htmlId && HTML_ID.test(node.htmlId)) attrs.id = node.htmlId;
    const def = ELEMENTS[type as keyof typeof ELEMENTS];
    if (node.type === "container") {
      const children = (Array.isArray(node.children) ? node.children : [])
        .map((child) => visit(child, false))
        .filter((child): child is VNode => child !== undefined);
      return def.build(node as never, attrs, children);
    }
    return def.build(node as never, attrs, []);
  };

  const vnode = visit(layout.root, true) ?? {
    tag: "div",
    attrs: { class: "emvb-root" },
    children: [],
  };
  const baseCss = new Map(Object.entries(ELEMENTS).map(([type, def]) => [type, def.baseCss]));
  return {
    vnode,
    html: serialize(vnode),
    css: generateCss({ design, usedTypes, baseCss, localRules }),
    needsFormsRuntime: false,
    warnings,
  };
}
