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
import type { ElementDescriptor } from "../schema/descriptors.ts";
import type { ElementDefinition } from "./definition.ts";

/** A form field's descriptor: always in the Form group, opening on Content. */
const fieldDescriptor = (
  type: string,
  name: string,
  fields: ElementDescriptor["fields"],
): ElementDescriptor => ({ type, name, group: "form", defaultTab: "content", fields });

const NAME_AND_LABEL: ElementDescriptor["fields"] = [
  { key: "field", kind: "text", label: "Field name" },
  { key: "label", kind: "text", label: "Label", optional: true },
];

const TEXT_FIELDS: ElementDescriptor["fields"] = [
  ...NAME_AND_LABEL,
  { key: "placeholder", kind: "text", label: "Placeholder", optional: true },
];

export const form: ElementDefinition<FormNode> = {
  baseCss:
    ".emvb-form{display:flex;flex-direction:column;gap:12px;min-width:0}.emvb-form-unbound{min-height:48px;padding:12px;color:var(--text-color-kumo-subtle,#666);background:var(--color-kumo-tint,#eee)}.ec-form-hp{position:absolute;left:-9999px}",
  defaults: () => ({ type: "form", props: { formId: "" }, children: [] }),
  descriptor: fieldDescriptor("form", "Form", [
    { key: "formId", kind: "text", label: "Form id", message: "Paste a forms-plugin form id." },
  ]),
  build: (_node, attrs, children) => ({
    tag: "form",
    attrs,
    children,
  }),
};

/** Where the forms runtime writes a field's validation message. */
const errorSlot = (name: string): VNode => ({
  tag: "span",
  attrs: { class: "ec-form-error", "data-error-for": name, "aria-live": "polite" },
  children: [],
});

const fieldBox = (attrs: Record<string, string>, children: VNode["children"]): VNode => ({
  tag: "div",
  attrs: { ...attrs, class: `${attrs.class ?? ""} emvb-form-field`.trim() },
  children,
});

const fieldWrap = (
  name: string,
  labelText: string | undefined,
  control: VNode,
  attrs: Record<string, string>,
): VNode =>
  fieldBox(attrs, [
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
    errorSlot(name),
  ]);

/** A text input or textarea bound to `field`, with its optional placeholder. */
const textControl = (
  tag: "input" | "textarea",
  props: { field: string; placeholder?: string | undefined },
): VNode => ({
  tag,
  attrs: {
    ...(tag === "input" ? { type: "text" } : {}),
    class: "ec-form-input",
    id: props.field,
    name: props.field,
    ...(props.placeholder ? { placeholder: props.placeholder } : {}),
  },
  children: [],
});

export const textInput: ElementDefinition<TextInputNode> = {
  baseCss: ".emvb-text-input{display:flex;flex-direction:column;gap:4px}",
  defaults: () => ({ type: "text-input", props: { field: "name", label: "Name" } }),
  descriptor: fieldDescriptor("text-input", "Text input", TEXT_FIELDS),
  build: (node, attrs) =>
    fieldWrap(node.props.field, node.props.label, textControl("input", node.props), attrs),
};

export const textareaEl: ElementDefinition<TextareaNode> = {
  baseCss: ".emvb-textarea-field{display:flex;flex-direction:column;gap:4px}",
  defaults: () => ({ type: "textarea", props: { field: "message", label: "Message" } }),
  descriptor: fieldDescriptor("textarea", "Textarea", TEXT_FIELDS),
  build: (node, attrs) =>
    fieldWrap(node.props.field, node.props.label, textControl("textarea", node.props), attrs),
};

export const selectEl: ElementDefinition<SelectNode> = {
  baseCss: ".emvb-select{display:flex;flex-direction:column;gap:4px}",
  defaults: () => ({ type: "select", props: { field: "choice", label: "Choice" } }),
  descriptor: fieldDescriptor("select", "Select", NAME_AND_LABEL),
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
  descriptor: fieldDescriptor("checkbox", "Checkbox", NAME_AND_LABEL),
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
    return fieldBox(attrs, [labelEl, errorSlot(name)]);
  },
};

export const radio: ElementDefinition<RadioNode> = {
  baseCss: ".emvb-radio{display:flex;flex-direction:column;gap:4px}",
  defaults: () => ({ type: "radio", props: { field: "option", label: "Option" } }),
  descriptor: fieldDescriptor("radio", "Radio", NAME_AND_LABEL),
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
  descriptor: fieldDescriptor("submit", "Submit", [
    { key: "label", kind: "text", label: "Label", optional: true },
  ]),
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
