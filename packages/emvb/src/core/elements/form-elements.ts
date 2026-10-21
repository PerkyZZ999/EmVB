import { selectPrompt } from "./select-prompt.ts";
import { controlId } from "./field-id.ts";
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

/**
 * Default field look (W-114). Every selector sits inside `:where`, so it has no specificity:
 * a class, a field's own style or the host theme's `input` rule wins. Colours come from
 * `currentColor`, so the fields follow the text colour of the page, the form or the field, and
 * the field's typography reaches the control through `font: inherit`.
 */
const FORM_FIELD_CSS =
  ":where(.emvb-form .emvb-form-label){font-weight:600}" +
  ":where(.emvb-form .ec-form-input){box-sizing:border-box;width:100%;max-width:100%;margin:0;padding:.625em .75em;font:inherit;color:inherit;background-color:transparent;border:1px solid rgba(128,128,128,.5);border:1px solid color-mix(in srgb,currentColor 30%,transparent);border-radius:6px}" +
  ":where(.emvb-form textarea.ec-form-input){min-height:7.5em;resize:vertical}" +
  ":where(.emvb-form .ec-form-input)::placeholder{color:inherit;opacity:.55}" +
  ":where(.emvb-form .ec-form-input:focus-visible){outline:2px solid currentColor;outline-offset:1px;border-color:currentColor}" +
  ':where(.emvb-form .ec-form-input[aria-invalid="true"]){border-color:#b3261e}' +
  ':where(.emvb-form input[type="checkbox"],.emvb-form input[type="radio"]){width:1.1em;height:1.1em;margin:0;accent-color:currentColor}' +
  ":where(.emvb-form .emvb-form-checkbox-label,.emvb-form .emvb-form-radio-label){display:inline-flex;align-items:center;gap:.5em;overflow-wrap:anywhere}" +
  ":where(.emvb-form .emvb-radio-group){display:flex;flex-direction:column;gap:6px;margin:0;padding:0;border:0;min-width:0}" +
  ":where(.emvb-form .emvb-radio-group>legend){float:left;width:100%;margin:0 0 -2px;padding:0}" +
  ":where(.emvb-form .ec-form-error){font-size:.875em;color:#b3261e}";

export const form: ElementDefinition<FormNode> = {
  baseCss:
    ".emvb-form{display:flex;flex-direction:column;gap:12px;min-width:0}.emvb-form-unbound{min-height:48px;padding:12px;color:var(--text-color-kumo-subtle,#666);background:var(--color-kumo-tint,#eee)}.emvb-form-field[hidden]{display:none!important}.ec-form-hp{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}" +
    ":where(.emvb-form-paused){padding:12px 16px;border:1px solid rgba(128,128,128,.5);border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:6px}:where(.emvb-form-paused p){margin:0}" +
    FORM_FIELD_CSS,
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
const errorSlot = (name: string, controlFor: string): VNode => ({
  tag: "span",
  attrs: {
    class: "ec-form-error",
    id: errorId(controlFor),
    "data-error-for": name,
    "aria-live": "polite",
  },
  children: [],
});

/**
 * W-780: the message was only announced as it appeared; back on the field it wasn't read. Each
 * control now names its error slot in aria-describedby (an empty slot adds nothing).
 */
const errorId = (controlFor: string) => `${controlFor}-error`;
const describedBy = (controlFor: string) => ({ "aria-describedby": errorId(controlFor) });

const fieldBox = (attrs: Record<string, string>, children: VNode["children"]): VNode => ({
  tag: "div",
  attrs: { ...attrs, class: `${attrs.class ?? ""} emvb-form-field`.trim() },
  children,
});

const fieldWrap = (
  controlFor: string,
  name: string,
  labelText: string | undefined,
  control: VNode,
  attrs: Record<string, string>,
): VNode =>
  fieldBox(attrs, [
    // W-587: a blank label is no label.
    ...(labelText?.trim()
      ? [
          {
            tag: "label",
            attrs: { class: "emvb-form-label", for: controlFor },
            children: [labelText],
          } as VNode,
        ]
      : []),
    withDescription(labelText?.trim() ? control : named(control, name), controlFor),
    errorSlot(name, controlFor),
  ]);

const withDescription = (control: VNode, controlFor: string): VNode => ({
  ...control,
  attrs: { ...control.attrs, ...describedBy(controlFor) },
});

/**
 * W-753: a field with no label (and no placeholder to read out) had no name at all, so a screen
 * reader said only "edit text" or "group". It falls back to the field name, as a checkbox does.
 */
const named = (control: VNode, name: string): VNode =>
  control.attrs.placeholder?.trim() || !name.trim()
    ? control
    : { ...control, attrs: { ...control.attrs, "aria-label": name } };

/** A text input or textarea bound to `field`, with its optional placeholder. */
const textControl = (
  tag: "input" | "textarea",
  props: { field: string; placeholder?: string | undefined },
  id: string,
): VNode => ({
  tag,
  attrs: {
    ...(tag === "input" ? { type: "text" } : {}),
    class: "ec-form-input",
    id,
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
    fieldWrap(
      controlId(node.id),
      node.props.field,
      node.props.label,
      textControl("input", node.props, controlId(node.id)),
      attrs,
    ),
};

export const textareaEl: ElementDefinition<TextareaNode> = {
  baseCss: ".emvb-textarea-field{display:flex;flex-direction:column;gap:4px}",
  defaults: () => ({ type: "textarea", props: { field: "message", label: "Message" } }),
  descriptor: fieldDescriptor("textarea", "Textarea", TEXT_FIELDS),
  build: (node, attrs) =>
    fieldWrap(
      controlId(node.id),
      node.props.field,
      node.props.label,
      textControl("textarea", node.props, controlId(node.id)),
      attrs,
    ),
};

export const selectEl: ElementDefinition<SelectNode> = {
  baseCss: ".emvb-select{display:flex;flex-direction:column;gap:4px}",
  defaults: () => ({ type: "select", props: { field: "choice", label: "Choice" } }),
  // W-686: the Placeholder words the empty first choice ("Choose…"), for sites in other languages.
  descriptor: fieldDescriptor("select", "Select", TEXT_FIELDS),
  build: (node, attrs) => {
    const name = node.props.field;
    const control: VNode = {
      tag: "select",
      attrs: { class: "ec-form-input", id: controlId(node.id), name },
      children: [{ tag: "option", attrs: { value: "" }, children: [selectPrompt(node.props)] }],
    };
    return fieldWrap(controlId(node.id), name, node.props.label, control, attrs);
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
      attrs: {
        type: "checkbox",
        id: controlId(node.id),
        name,
        value: "true",
        ...describedBy(controlId(node.id)),
      },
      children: [],
    };
    const labelEl: VNode = {
      tag: "label",
      attrs: { class: "emvb-form-checkbox-label" },
      children: [input, ` ${node.props.label?.trim() || name}`],
    };
    return fieldBox(attrs, [labelEl, errorSlot(name, controlId(node.id))]);
  },
};

export const radio: ElementDefinition<RadioNode> = {
  baseCss: ".emvb-radio{display:flex;flex-direction:column;gap:4px}",
  defaults: () => ({ type: "radio", props: { field: "option", label: "Option" } }),
  descriptor: fieldDescriptor("radio", "Radio", NAME_AND_LABEL),
  build: (node, attrs) => {
    const name = node.props.field;
    // Options filled from definition in W-035; placeholder single option for schema/render smoke.
    const id = controlId(node.id);
    // W-524: the question is the fieldset's <legend>, so the group is named natively (it was a
    // <label> pointing at nothing plus aria-labelledby, W-442). The id stays for old references.
    const legend: VNode[] = node.props.label?.trim()
      ? [
          {
            tag: "legend",
            attrs: { class: "emvb-form-label", id: `${id}-label` },
            children: [node.props.label],
          },
        ]
      : [];
    const control: VNode = {
      tag: "fieldset",
      attrs: {
        class: "emvb-radio-group",
        ...describedBy(id),
        ...(legend.length || !name.trim() ? {} : { "aria-label": name }),
      },
      children: [
        ...legend,
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
    return fieldBox(attrs, [control, errorSlot(name, id)]);
  },
};

export const submit: ElementDefinition<SubmitNode> = {
  baseCss: ".emvb-submit{display:inline-flex;max-width:100%;overflow-wrap:anywhere}",
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
    // W-447: a blank label left an empty button with no name; it falls back like an unset one.
    children: [node.props.label?.trim() || "Submit"],
  }),
};
