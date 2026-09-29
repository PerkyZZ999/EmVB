import type {
  CheckboxNode,
  FormNode,
  RadioNode,
  SelectNode,
  SubmitNode,
  TextInputNode,
  TextareaNode,
} from "../schema/layout.ts";
import type { VNode } from "../render/vnode.ts";
import type { ElementDefinition } from "./definition.ts";

export const form: ElementDefinition<FormNode> = {
  baseCss:
    ".emvb-form{display:flex;flex-direction:column;gap:12px;min-width:0}.emvb-form-unbound{min-height:48px;padding:12px;color:var(--text-color-kumo-subtle,#666);background:var(--color-kumo-tint,#eee)}.ec-form-hp{position:absolute;left:-9999px}",
  defaults: () => ({ type: "form", props: { formId: "" }, children: [] }),
  descriptor: {
    type: "form",
    name: "Form",
    group: "form",
    defaultTab: "content",
    fields: [
      { key: "formId", kind: "text", label: "Form id", message: "Paste a forms-plugin form id." },
    ],
  },
  build: (_node, attrs, children) => ({
    tag: "form",
    attrs,
    children,
  }),
};

const fieldWrap = (
  name: string,
  labelText: string | undefined,
  control: VNode,
  attrs: Record<string, string>,
): VNode => ({
  tag: "div",
  attrs: { ...attrs, class: `${attrs.class ?? ""} emvb-form-field`.trim() },
  children: [
    ...(labelText
      ? [
          {
            tag: "label",
            attrs: { class: "emvb-form-label", for: name },
            children: [labelText],
          } as VNode,
        ]
      : []),
    control,
    {
      tag: "span",
      attrs: { class: "ec-form-error", "data-error-for": name, "aria-live": "polite" },
      children: [],
    },
  ],
});

export const textInput: ElementDefinition<TextInputNode> = {
  baseCss: ".emvb-text-input{display:flex;flex-direction:column;gap:4px}",
  defaults: () => ({ type: "text-input", props: { field: "name", label: "Name" } }),
  descriptor: {
    type: "text-input",
    name: "Text input",
    group: "form",
    defaultTab: "content",
    fields: [
      { key: "field", kind: "text", label: "Field name" },
      { key: "label", kind: "text", label: "Label", optional: true },
      { key: "placeholder", kind: "text", label: "Placeholder", optional: true },
    ],
  },
  build: (node, attrs) => {
    const name = node.props.field;
    const control: VNode = {
      tag: "input",
      attrs: {
        type: "text",
        class: "ec-form-input",
        id: name,
        name,
        ...(node.props.placeholder ? { placeholder: node.props.placeholder } : {}),
      },
      children: [],
    };
    return fieldWrap(name, node.props.label, control, attrs);
  },
};

export const textareaEl: ElementDefinition<TextareaNode> = {
  baseCss: ".emvb-textarea-field{display:flex;flex-direction:column;gap:4px}",
  defaults: () => ({ type: "textarea", props: { field: "message", label: "Message" } }),
  descriptor: {
    type: "textarea",
    name: "Textarea",
    group: "form",
    defaultTab: "content",
    fields: [
      { key: "field", kind: "text", label: "Field name" },
      { key: "label", kind: "text", label: "Label", optional: true },
      { key: "placeholder", kind: "text", label: "Placeholder", optional: true },
    ],
  },
  build: (node, attrs) => {
    const name = node.props.field;
    const control: VNode = {
      tag: "textarea",
      attrs: {
        class: "ec-form-input",
        id: name,
        name,
        ...(node.props.placeholder ? { placeholder: node.props.placeholder } : {}),
      },
      children: [],
    };
    return fieldWrap(name, node.props.label, control, attrs);
  },
};

export const selectEl: ElementDefinition<SelectNode> = {
  baseCss: ".emvb-select{display:flex;flex-direction:column;gap:4px}",
  defaults: () => ({ type: "select", props: { field: "choice", label: "Choice" } }),
  descriptor: {
    type: "select",
    name: "Select",
    group: "form",
    defaultTab: "content",
    fields: [
      { key: "field", kind: "text", label: "Field name" },
      { key: "label", kind: "text", label: "Label", optional: true },
    ],
  },
  build: (node, attrs) => {
    const name = node.props.field;
    const control: VNode = {
      tag: "select",
      attrs: { class: "ec-form-input", id: name, name },
      children: [{ tag: "option", attrs: { value: "" }, children: ["Choose…"] }],
    };
    return fieldWrap(name, node.props.label, control, attrs);
  },
};

export const checkbox: ElementDefinition<CheckboxNode> = {
  baseCss: ".emvb-checkbox{display:flex;align-items:center;gap:8px}",
  defaults: () => ({ type: "checkbox", props: { field: "agree", label: "I agree" } }),
  descriptor: {
    type: "checkbox",
    name: "Checkbox",
    group: "form",
    defaultTab: "content",
    fields: [
      { key: "field", kind: "text", label: "Field name" },
      { key: "label", kind: "text", label: "Label", optional: true },
    ],
  },
  build: (node, attrs) => {
    const name = node.props.field;
    const input: VNode = {
      tag: "input",
      attrs: { type: "checkbox", id: name, name, value: "true" },
      children: [],
    };
    const labelEl: VNode = {
      tag: "label",
      attrs: { class: "emvb-form-checkbox-label" },
      children: [input, ` ${node.props.label ?? name}`],
    };
    const error: VNode = {
      tag: "span",
      attrs: { class: "ec-form-error", "data-error-for": name, "aria-live": "polite" },
      children: [],
    };
    return {
      tag: "div",
      attrs: { ...attrs, class: `${attrs.class ?? ""} emvb-form-field`.trim() },
      children: [labelEl, error],
    };
  },
};

export const radio: ElementDefinition<RadioNode> = {
  baseCss: ".emvb-radio{display:flex;flex-direction:column;gap:4px}",
  defaults: () => ({ type: "radio", props: { field: "option", label: "Option" } }),
  descriptor: {
    type: "radio",
    name: "Radio",
    group: "form",
    defaultTab: "content",
    fields: [
      { key: "field", kind: "text", label: "Field name" },
      { key: "label", kind: "text", label: "Label", optional: true },
    ],
  },
  build: (node, attrs) => {
    const name = node.props.field;
    // Options filled from definition in W-035; placeholder single option for schema/render smoke.
    const control: VNode = {
      tag: "fieldset",
      attrs: { class: "emvb-radio-group" },
      children: [
        {
          tag: "label",
          attrs: { class: "emvb-form-radio-label" },
          children: [
            { tag: "input", attrs: { type: "radio", name, value: "a" }, children: [] },
            " Option A",
          ],
        },
      ],
    };
    return fieldWrap(name, node.props.label, control, attrs);
  },
};

export const submit: ElementDefinition<SubmitNode> = {
  baseCss: ".emvb-submit{display:inline-flex}",
  defaults: () => ({ type: "submit", props: { label: "Submit" } }),
  descriptor: {
    type: "submit",
    name: "Submit",
    group: "form",
    defaultTab: "content",
    fields: [{ key: "label", kind: "text", label: "Label", optional: true }],
  },
  build: (node, attrs) => ({
    tag: "button",
    attrs: {
      ...attrs,
      type: "submit",
      class: `${attrs.class ?? ""} ec-form-submit`.trim(),
    },
    children: [node.props.label ?? "Submit"],
  }),
};
