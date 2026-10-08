import { fieldByName, type FormDefinitions } from "../forms/definition.ts";
import type { FormNode, LayoutNode } from "../schema/layout.ts";
import type { ThemeDynamicData } from "../theme/dynamic.ts";
import { nodeChildren } from "../tree-ops.ts";
import type { RenderContext } from "./context.ts";
import type { VNode } from "./vnode.ts";

export const FORMS_SUBMIT_PATH = "/_emdash/api/plugins/emdash-forms/submit";

const honeypot = (inputId: string): VNode => ({
  tag: "div",
  attrs: {
    class: "ec-form-hp",
    "aria-hidden": "true",
  },
  children: [
    {
      tag: "label",
      attrs: { for: inputId },
      children: ["Leave blank"],
    },
    {
      tag: "input",
      attrs: {
        type: "text",
        id: inputId,
        name: "_hp",
        tabindex: "-1",
        autocomplete: "off",
      },
      children: [],
    },
  ],
});

/** An EmDash Forms markup shell (D-006) around the form's fields; unbound forms only preview in the editor. */
/** The text of the form's first Submit button, as the page renders it. */
function firstSubmitLabel(nodes: readonly LayoutNode[]): string | undefined {
  for (const child of nodes) {
    if (child.type === "submit") return (child.props as { label?: string }).label ?? "Submit";
    const found = firstSubmitLabel(nodeChildren(child));
    if (found !== undefined) return found;
  }
  return undefined;
}

export function renderForm(
  node: FormNode,
  attrs: Record<string, string>,
  ctx: RenderContext,
  dynamic: ThemeDynamicData | undefined,
): VNode | undefined {
  const formId = node.props.formId.trim();
  // Unbound forms: no live <form>/ec-form shell (avoids broken preview; public stays zero-JS).
  if (!formId) {
    if (ctx.mode === "public") return undefined;
    return {
      tag: "div",
      attrs: {
        ...attrs,
        class: `${attrs.class} emvb-form-unbound`.trim(),
        "data-emvb-form-unbound": "",
      },
      children: ["Bind a form in settings to preview it here."],
    };
  }
  // W-203: the forms client puts this label back on the button after each submit, so it must be
  // the label the page shows, not the form definition's.
  const submitLabel =
    firstSubmitLabel(node.children) ??
    ctx.definitions.get(formId)?.settings.submitLabel ??
    "Submit";
  const page: VNode = {
    tag: "div",
    attrs: { "data-page": "0" },
    children: ctx.children(node.children, dynamic),
  };
  return {
    tag: "form",
    attrs: {
      ...attrs,
      class: `${attrs.class} ec-form`.trim(),
      method: "POST",
      action: FORMS_SUBMIT_PATH,
      "data-ec-form": "",
      "data-form-id": formId,
      "data-submit-label": submitLabel,
    },
    children: [
      page,
      { tag: "input", attrs: { type: "hidden", name: "formId", value: formId }, children: [] },
      // One id per form element, so the same form placed twice keeps unique ids (W-187), also
      // when one form element renders twice, from a synced section or a loop item (W-249).
      honeypot(ctx.uniqueId(`emvb-hp-${node.id}`)),
      {
        tag: "div",
        attrs: { class: "ec-form-status", "data-form-status": "", "aria-live": "polite" },
        children: [],
      },
    ],
  };
}

/** Replaces the children of every node matching `match`, anywhere in the tree. */
function replaceChildren(vnode: VNode, match: (node: VNode) => boolean, children: VNode[]): VNode {
  if (match(vnode)) return { ...vnode, children };
  return {
    ...vnode,
    children: vnode.children.map((child) =>
      typeof child === "string" ? child : replaceChildren(child, match, children),
    ),
  };
}

/** Fills a select or radio field with the options of the first bound form definition that has it. */
export function withFieldOptions(
  vnode: VNode,
  node: LayoutNode,
  definitions: FormDefinitions,
): VNode {
  if (node.type !== "select" && node.type !== "radio") return vnode;
  const field = (node.props as { field: string }).field;
  for (const definition of definitions.values()) {
    const meta = fieldByName(definition, field);
    if (!meta) continue;
    if (!meta.options?.length) return vnode;
    if (node.type === "select") {
      return replaceChildren(vnode, (child) => child.tag === "select", [
        { tag: "option", attrs: { value: "" }, children: ["Choose…"] },
        ...meta.options.map((option): VNode => ({
          tag: "option",
          attrs: { value: option.value },
          children: [option.label],
        })),
      ]);
    }
    return replaceChildren(
      vnode,
      (child) => child.tag === "fieldset" && (child.attrs.class ?? "").includes("emvb-radio-group"),
      meta.options.map((option) => ({
        tag: "label",
        attrs: { class: "emvb-form-radio-label" },
        children: [
          {
            tag: "input",
            attrs: { type: "radio", name: field, value: option.value },
            children: [],
          },
          ` ${option.label}`,
        ],
      })),
    );
  }
  return vnode;
}
