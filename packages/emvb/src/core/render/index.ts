import { generateCss } from "../css/generate.ts";
import { ELEMENTS } from "../elements/index.ts";
import {
  fieldByName,
  type FormDefinitions,
  type PublicFormDefinition,
} from "../forms/definition.ts";
import { layoutHasForm } from "../forms/binding.ts";
import type { DesignSystem } from "../schema/design.ts";
import { isFormNode, isParentNode, type Layout, type LayoutNode } from "../schema/layout.ts";
import { cssLength, styleClassName, styleDeclarations, type Declaration } from "../sanitize/css.ts";
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
export const FORMS_SUBMIT_PATH = "/_emdash/api/plugins/emdash-forms/submit";

const honeypot = (formId: string): VNode => ({
  tag: "div",
  attrs: {
    class: "ec-form-hp",
    "aria-hidden": "true",
  },
  children: [
    {
      tag: "label",
      attrs: { for: `${formId}-_hp` },
      children: ["Leave blank"],
    },
    {
      tag: "input",
      attrs: {
        type: "text",
        id: `${formId}-_hp`,
        name: "_hp",
        tabindex: "-1",
        autocomplete: "off",
      },
      children: [],
    },
  ],
});

function withSelectOptions(
  vnode: VNode,
  definition: PublicFormDefinition | undefined,
  field: string,
): VNode {
  const meta = fieldByName(definition, field);
  if (!meta?.options?.length) return vnode;
  const options: VNode[] = [
    { tag: "option", attrs: { value: "" }, children: ["Choose…"] },
    ...meta.options.map((option): VNode => ({
      tag: "option",
      attrs: { value: option.value },
      children: [option.label],
    })),
  ];
  const patch = (node: VNode): VNode => {
    if (node.tag === "select") return { ...node, children: options };
    return {
      ...node,
      children: node.children.map((child) => (typeof child === "string" ? child : patch(child))),
    };
  };
  return patch(vnode);
}

function withRadioOptions(
  vnode: VNode,
  definition: PublicFormDefinition | undefined,
  field: string,
): VNode {
  const meta = fieldByName(definition, field);
  if (!meta?.options?.length) return vnode;
  const options: VNode[] = meta.options.map((option) => ({
    tag: "label",
    attrs: { class: "emvb-form-radio-label" },
    children: [
      { tag: "input", attrs: { type: "radio", name: field, value: option.value }, children: [] },
      ` ${option.label}`,
    ],
  }));
  const patch = (node: VNode): VNode => {
    if (node.tag === "fieldset" && (node.attrs.class ?? "").includes("emvb-radio-group")) {
      return { ...node, children: options };
    }
    return {
      ...node,
      children: node.children.map((child) => (typeof child === "string" ? child : patch(child))),
    };
  };
  return patch(vnode);
}

/**
 * Renders a validated layout to lean HTML and CSS (R-031, R-032). Walks defensively: unknown types
 * render nothing publicly and a placeholder in the editor (R-033); unsafe style values are dropped.
 */
export function renderPage(
  layout: Layout,
  design: DesignSystem,
  opts: { mode?: RenderMode; formDefinitions?: FormDefinitions } = {},
): RenderResult {
  const mode = opts.mode ?? "public";
  const definitions = opts.formDefinitions ?? new Map();
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
    for (const classId of node.classes ?? []) {
      const name = styleClassName(classId);
      if (name) classes.push(name);
    }
    const { declarations, rejected } = styleDeclarations(node.style);
    for (const key of rejected) warnings.push({ nodeId, code: "rejected-style", detail: key });
    if (node.type === "spacer") {
      const height = cssLength((node as { props: { height: unknown } }).props.height);
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

    if (isFormNode(node)) {
      const formId = node.props.formId;
      const definition = formId ? definitions.get(formId) : undefined;
      const submitLabel = definition?.settings.submitLabel ?? "Submit";
      const children = node.children
        .map((child) => visit(child, false))
        .filter((child): child is VNode => child !== undefined);
      const page: VNode = {
        tag: "div",
        attrs: { "data-page": "0" },
        children,
      };
      const formAttrs: Record<string, string> = {
        ...attrs,
        class: `${attrs.class} ec-form`.trim(),
        method: "POST",
        action: FORMS_SUBMIT_PATH,
        "data-ec-form": "",
        "data-form-id": formId,
        "data-submit-label": submitLabel,
      };
      const built: VNode = {
        tag: "form",
        attrs: formAttrs,
        children: [
          page,
          { tag: "input", attrs: { type: "hidden", name: "formId", value: formId }, children: [] },
          honeypot(formId || "form"),
          {
            tag: "div",
            attrs: { class: "ec-form-status", "data-form-status": "", "aria-live": "polite" },
            children: [],
          },
        ],
      };
      return built;
    }

    if (isParentNode(node)) {
      const children = node.children
        .map((child) => visit(child, false))
        .filter((child): child is VNode => child !== undefined);
      return def.build(node as never, attrs, children);
    }

    let vnode = def.build(node as never, attrs, []);
    if (node.type === "select" || node.type === "radio") {
      const field = (node.props as { field: string }).field;
      for (const definition of definitions.values()) {
        if (!fieldByName(definition, field)) continue;
        vnode =
          node.type === "select"
            ? withSelectOptions(vnode, definition, field)
            : withRadioOptions(vnode, definition, field);
        break;
      }
    }
    return vnode;
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
    needsFormsRuntime: layoutHasForm(layout),
    warnings,
  };
}
