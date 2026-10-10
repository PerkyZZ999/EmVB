import { fieldByName, type FormDefinitions, type PublicFormField } from "../forms/definition.ts";
import type { FormNode, LayoutNode } from "../schema/layout.ts";
import type { ThemeDynamicData } from "../theme/dynamic.ts";
import { nodeChildren } from "../tree-ops.ts";
import type { RenderContext } from "./context.ts";
import type { VNode } from "./vnode.ts";

export const FORMS_SUBMIT_PATH = "/_emdash/api/plugins/emdash-forms/submit";

/** What a paused form shows on the page (W-326). */
export const FORM_PAUSED_TEXT = "This form isn't accepting responses right now.";

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
  // W-326: a paused form says so, in place of fields that can't be sent (the forms plugin refuses
  // its submissions), with no form, inputs or Submit button.
  if (ctx.definitions.get(formId)?.status === "paused") {
    return {
      tag: "div",
      attrs: {
        ...attrs,
        class: `${attrs.class} emvb-form-paused`.trim(),
        role: "status",
        "data-emvb-form-paused": "",
      },
      children: [{ tag: "p", attrs: {}, children: [FORM_PAUSED_TEXT] }],
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
      // W-297: the forms client checks each control itself and writes the message next to the
      // field, as the server's errors are; without this the browser's bubble would come first.
      novalidate: "",
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

/** Applies `edit` to every element node in the tree, children first. */
function mapNodes(vnode: VNode, edit: (node: VNode) => VNode): VNode {
  return edit({
    ...vnode,
    children: vnode.children.map((child) =>
      typeof child === "string" ? child : mapNodes(child, edit),
    ),
  });
}

/** Definition types a Text input can take on; the rest stay `text`. */
const INPUT_TYPES = new Set(["email", "tel", "url", "number", "date"]);
const LENGTH_TYPES = new Set(["text", "email", "tel", "url", "textarea"]);
const isControl = (node: VNode) =>
  ["input", "select", "textarea"].includes(node.tag) && node.attrs.type !== "hidden";

/**
 * W-297: what the forms plugin's own embed puts on a control: the input type (so phones show the
 * right keyboard), `required`, and the length, range and pattern limits, plus a visible mark on
 * the label. Without them the forms client found nothing to check before sending.
 */
function withFieldMeta(vnode: VNode, node: LayoutNode, meta: PublicFormField): VNode {
  const type = node.type === "text-input" && INPUT_TYPES.has(meta.type) ? meta.type : undefined;
  const rules = meta.validation ?? {};
  const kind = type ?? (node.type === "textarea" ? "textarea" : meta.type);
  const limits: Record<string, string> = {};
  if (node.type === "text-input" || node.type === "textarea") {
    if (LENGTH_TYPES.has(kind)) {
      if (rules.minLength !== undefined) limits.minlength = String(rules.minLength);
      if (rules.maxLength !== undefined) limits.maxlength = String(rules.maxLength);
    }
    if (kind === "number") {
      if (rules.min !== undefined) limits.min = String(rules.min);
      if (rules.max !== undefined) limits.max = String(rules.max);
    }
    if (node.type === "text-input" && kind !== "number" && kind !== "date" && rules.pattern) {
      limits.pattern = rules.pattern;
    }
  }
  const mark: VNode = {
    tag: "span",
    attrs: { class: "emvb-form-required", "aria-hidden": "true" },
    children: [" *"],
  };
  return mapNodes(vnode, (child) => {
    if (isControl(child)) {
      return {
        ...child,
        attrs: {
          ...child.attrs,
          ...(type ? { type } : {}),
          ...(meta.required ? { required: "" } : {}),
          ...limits,
        },
      };
    }
    if (!meta.required || child.tag !== "label") return child;
    if (child.attrs.class === "emvb-form-label") {
      return { ...child, children: [...child.children, mark] };
    }
    // The checkbox label wraps the input and the label text; the mark follows the text.
    if (child.attrs.class === "emvb-form-checkbox-label") {
      return {
        ...child,
        children: child.children.map((part) => (typeof part === "string" ? `${part} *` : part)),
      };
    }
    return child;
  });
}

/** Fills a field from the first bound form definition that has it: options, type, limits. */
export function withFieldOptions(
  vnode: VNode,
  node: LayoutNode,
  definitions: FormDefinitions,
): VNode {
  const field = (node.props as { field?: unknown }).field;
  if (typeof field !== "string") return vnode;
  for (const definition of definitions.values()) {
    const meta = fieldByName(definition, field);
    if (!meta) continue;
    return withFieldMeta(withOptions(vnode, node, meta), node, meta);
  }
  return vnode;
}

/** A select or radio field filled with the definition's options. */
function withOptions(vnode: VNode, node: LayoutNode, meta: PublicFormField): VNode {
  const field = meta.name;
  if ((node.type !== "select" && node.type !== "radio") || !meta.options?.length) return vnode;
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
