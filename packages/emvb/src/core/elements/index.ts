import type {
  ButtonNode,
  CheckboxNode,
  ContainerNode,
  DividerNode,
  FormNode,
  HeadingNode,
  IconNode,
  ImageNode,
  LabelNode,
  LinkNode,
  ListNode,
  RadioNode,
  SelectNode,
  SpacerNode,
  SubmitNode,
  TextInputNode,
  TextareaNode,
  TextNode,
  VideoNode,
} from "../schema/layout.ts";
import { CONTAINER_TAGS, TEXT_TAGS } from "../schema/layout.ts";
import type { ElementDescriptor } from "../schema/descriptors.ts";
import { sanitizeHref } from "../sanitize/href.ts";
import { sanitizeMediaUrl } from "../sanitize/media-url.ts";
import { getBundledIcon } from "../icons/catalog.ts";
import { resolveEmbedUrl } from "../sanitize/embed-url.ts";
import type { VNode } from "../render/vnode.ts";

type Build<N> = (node: N, attrs: Record<string, string>, children: VNode[]) => VNode;

type ElementDefinition<N> = {
  baseCss: string;
  build: Build<N>;
  descriptor: ElementDescriptor;
  defaults: () => Omit<N, "id">;
};

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

const newTabAttrs = (newTab: boolean | undefined): Record<string, string> =>
  newTab ? { target: "_blank", rel: "noopener noreferrer" } : {};

const heading: ElementDefinition<HeadingNode> = {
  baseCss: ".emvb-heading{margin:0}",
  defaults: () => ({ type: "heading", props: { text: "Heading", level: 2 } }),
  descriptor: {
    type: "heading",
    name: "Heading",
    group: "content",
    defaultTab: "content",
    fields: [
      { key: "text", kind: "text", label: "Text" },
      {
        key: "level",
        kind: "select",
        label: "Level",
        options: [1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: `H${n}` })),
      },
    ],
  },
  build: (node, attrs) => ({
    tag: HEADING_TAGS[node.props.level - 1] ?? "h2",
    attrs,
    children: [node.props.text],
  }),
};

const container: ElementDefinition<ContainerNode> = {
  baseCss: ".emvb-container{display:flex;flex-direction:column;min-width:0}",
  defaults: () => ({ type: "container", props: {}, children: [] }),
  descriptor: {
    type: "container",
    name: "Container",
    group: "layout",
    defaultTab: "style",
    fields: [
      {
        key: "tag",
        kind: "select",
        label: "HTML tag",
        optional: true,
        options: CONTAINER_TAGS.map((tag) => ({ value: tag, label: tag })),
        message: "Pick a landmark or div.",
      },
    ],
  },
  build: (node, attrs, children) => {
    const tag = node.props.tag ?? "div";
    const safe = (CONTAINER_TAGS as readonly string[]).includes(tag) ? tag : "div";
    return { tag: safe, attrs, children };
  },
};

const spacer: ElementDefinition<SpacerNode> = {
  baseCss: ".emvb-spacer{flex-shrink:0}",
  defaults: () => ({ type: "spacer", props: { height: { value: 24, unit: "px" } } }),
  descriptor: {
    type: "spacer",
    name: "Spacer",
    group: "layout",
    defaultTab: "style",
    fields: [
      {
        key: "height",
        kind: "number",
        label: "Height",
        message: "Height can't be negative. Enter 0 or more.",
      },
    ],
  },
  build: (_node, attrs) => ({
    tag: "div",
    attrs: { ...attrs, "aria-hidden": "true" },
    children: [],
  }),
};

const divider: ElementDefinition<DividerNode> = {
  baseCss: ".emvb-divider{border:0;border-top:1px solid currentColor;margin:0}",
  defaults: () => ({ type: "divider", props: {} }),
  descriptor: {
    type: "divider",
    name: "Divider",
    group: "layout",
    defaultTab: "style",
    fields: [],
  },
  build: (_node, attrs) => ({ tag: "hr", attrs, children: [] }),
};

const text: ElementDefinition<TextNode> = {
  baseCss: ".emvb-text{margin:0}",
  defaults: () => ({ type: "text", props: { text: "Text" } }),
  descriptor: {
    type: "text",
    name: "Text",
    group: "content",
    defaultTab: "content",
    fields: [
      { key: "text", kind: "textarea", label: "Text" },
      {
        key: "tag",
        kind: "select",
        label: "HTML tag",
        optional: true,
        options: TEXT_TAGS.map((tag) => ({ value: tag, label: tag })),
      },
    ],
  },
  build: (node, attrs) => {
    const tag = node.props.tag ?? "p";
    const safe = (TEXT_TAGS as readonly string[]).includes(tag) ? tag : "p";
    return { tag: safe, attrs, children: [node.props.text] };
  },
};

const label: ElementDefinition<LabelNode> = {
  baseCss: ".emvb-label{display:inline}",
  defaults: () => ({ type: "label", props: { text: "Label" } }),
  descriptor: {
    type: "label",
    name: "Label",
    group: "content",
    defaultTab: "content",
    fields: [{ key: "text", kind: "text", label: "Text" }],
  },
  build: (node, attrs) => ({ tag: "span", attrs, children: [node.props.text] }),
};

const link: ElementDefinition<LinkNode> = {
  baseCss: ".emvb-link{}",
  defaults: () => ({ type: "link", props: { text: "Link", href: "/" } }),
  descriptor: {
    type: "link",
    name: "Link",
    group: "content",
    defaultTab: "content",
    fields: [
      { key: "text", kind: "text", label: "Text" },
      {
        key: "href",
        kind: "href",
        label: "URL",
        message: "Use a full URL such as https://example.com or a path such as /pricing.",
      },
      { key: "newTab", kind: "boolean", label: "Open in a new tab", optional: true },
    ],
  },
  build: (node, attrs) => {
    const href = sanitizeHref(node.props.href) ?? "#";
    return {
      tag: "a",
      attrs: { ...attrs, href, ...newTabAttrs(node.props.newTab) },
      children: [node.props.text],
    };
  },
};

const button: ElementDefinition<ButtonNode> = {
  baseCss:
    ".emvb-button{display:inline-flex;align-items:center;justify-content:center;margin:0;font:inherit;cursor:pointer}",
  defaults: () => ({ type: "button", props: { text: "Button" } }),
  descriptor: {
    type: "button",
    name: "Button",
    group: "content",
    defaultTab: "content",
    fields: [
      { key: "text", kind: "text", label: "Text" },
      {
        key: "href",
        kind: "href",
        label: "URL",
        optional: true,
        message: "Use a full URL such as https://example.com or a path such as /pricing.",
      },
      { key: "newTab", kind: "boolean", label: "Open in a new tab", optional: true },
    ],
  },
  build: (node, attrs) => {
    const href = node.props.href !== undefined ? sanitizeHref(node.props.href) : undefined;
    if (href) {
      return {
        tag: "a",
        attrs: { ...attrs, href, ...newTabAttrs(node.props.newTab) },
        children: [node.props.text],
      };
    }
    return {
      tag: "button",
      attrs: { ...attrs, type: "button" },
      children: [node.props.text],
    };
  },
};

const list: ElementDefinition<ListNode> = {
  baseCss: ".emvb-list{margin:0;padding-left:1.25em}.emvb-list li{margin:0}",
  defaults: () => ({ type: "list", props: { items: ["Item"] } }),
  descriptor: {
    type: "list",
    name: "List",
    group: "content",
    defaultTab: "content",
    fields: [
      { key: "ordered", kind: "boolean", label: "Numbered list", optional: true },
      { key: "items", kind: "list-items", label: "Items" },
    ],
  },
  build: (node, attrs) => ({
    tag: node.props.ordered ? "ol" : "ul",
    attrs,
    children: node.props.items.map((item) => ({ tag: "li", attrs: {}, children: [item] })),
  }),
};

const image: ElementDefinition<ImageNode> = {
  baseCss: ".emvb-image{display:block;max-width:100%;height:auto}",
  defaults: () => ({
    type: "image",
    props: { src: "", alt: "Image", decorative: false },
  }),
  descriptor: {
    type: "image",
    name: "Image",
    group: "content",
    defaultTab: "content",
    fields: [
      {
        key: "src",
        kind: "media",
        label: "Image",
        message:
          "Use a full URL such as https://example.com/photo.jpg or a path such as /uploads/photo.jpg.",
      },
      { key: "alt", kind: "text", label: "Alt text" },
      {
        key: "decorative",
        kind: "boolean",
        label: "Decorative (empty alt)",
        optional: true,
      },
      {
        key: "width",
        kind: "int",
        label: "Width (px)",
        optional: true,
        message: "Width must be a positive whole number.",
      },
      {
        key: "height",
        kind: "int",
        label: "Height (px)",
        optional: true,
        message: "Height must be a positive whole number.",
      },
    ],
  },
  build: (node, attrs) => {
    const src = sanitizeMediaUrl(node.props.src);
    if (!src) {
      return {
        tag: "span",
        attrs: { ...attrs, class: `${attrs.class ?? ""} emvb-image-missing`.trim() },
        children: [],
      };
    }
    const decorative = node.props.decorative === true;
    const imgAttrs: Record<string, string> = {
      ...attrs,
      src,
      alt: decorative ? "" : node.props.alt,
      loading: "lazy",
      decoding: "async",
    };
    if (decorative) imgAttrs.role = "presentation";
    if (node.props.width !== undefined) imgAttrs.width = String(node.props.width);
    if (node.props.height !== undefined) imgAttrs.height = String(node.props.height);
    return { tag: "img", attrs: imgAttrs, children: [] };
  },
};

const icon: ElementDefinition<IconNode> = {
  baseCss:
    ".emvb-icon{display:inline-flex;align-items:center;justify-content:center;line-height:0;color:inherit}.emvb-icon svg{display:block;width:1em;height:1em}.emvb-icon-missing{min-width:1em;min-height:1em;background:var(--color-kumo-tint,#eee)}",
  defaults: () => ({
    type: "icon",
    props: { iconId: "star", title: "Star", decorative: false, size: 24 },
  }),
  descriptor: {
    type: "icon",
    name: "Icon",
    group: "content",
    defaultTab: "content",
    fields: [
      { key: "iconId", kind: "icon", label: "Icon" },
      { key: "title", kind: "text", label: "Title" },
      {
        key: "decorative",
        kind: "boolean",
        label: "Decorative (hide from assistive tech)",
        optional: true,
      },
      {
        key: "size",
        kind: "int",
        label: "Size (px)",
        optional: true,
        message: "Size must be a positive whole number.",
      },
    ],
  },
  build: (node, attrs) => {
    const bundled = getBundledIcon(node.props.iconId);
    if (!bundled) {
      // Never treat iconId as a URL or raw HTML (R-032 / R-033).
      return {
        tag: "span",
        attrs: {
          ...attrs,
          class: `${attrs.class ?? ""} emvb-icon-missing`.trim(),
          "aria-hidden": "true",
        },
        children: [],
      };
    }
    const decorative = node.props.decorative === true;
    const size = node.props.size ?? 24;
    const svgAttrs: Record<string, string> = {
      xmlns: "http://www.w3.org/2000/svg",
      width: String(size),
      height: String(size),
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      focusable: "false",
    };
    if (decorative) {
      svgAttrs["aria-hidden"] = "true";
    } else {
      svgAttrs.role = "img";
      if (node.props.title) svgAttrs["aria-label"] = node.props.title;
    }
    const children: VNode[] = bundled.children.map((child) => ({
      tag: child.tag,
      attrs: { ...child.attrs },
      children: [],
    }));
    return {
      tag: "span",
      attrs,
      children: [{ tag: "svg", attrs: svgAttrs, children }],
    };
  },
};

const video: ElementDefinition<VideoNode> = {
  baseCss:
    ".emvb-video{display:block;max-width:100%;border:0}.emvb-video iframe,.emvb-video video{display:block;width:100%;aspect-ratio:16/9;border:0;background:#000}.emvb-video-missing{min-height:48px;background:var(--color-kumo-tint,#eee)}",
  defaults: () => ({
    type: "video",
    props: { url: "", title: "Video" },
  }),
  descriptor: {
    type: "video",
    name: "Video",
    group: "content",
    defaultTab: "content",
    fields: [
      {
        key: "url",
        kind: "href",
        label: "Video URL",
        message:
          "Use a YouTube or Vimeo link, or a media file path such as /_emdash/api/media/file/….",
      },
      { key: "title", kind: "text", label: "Title" },
    ],
  },
  build: (node, attrs) => {
    const target = resolveEmbedUrl(node.props.url);
    if (!target) {
      return {
        tag: "span",
        attrs: {
          ...attrs,
          class: `${attrs.class ?? ""} emvb-video-missing`.trim(),
          "aria-hidden": "true",
        },
        children: [],
      };
    }
    if (target.kind === "iframe") {
      return {
        tag: "iframe",
        attrs: {
          ...attrs,
          src: target.src,
          title: node.props.title,
          loading: "lazy",
          referrerpolicy: "strict-origin-when-cross-origin",
          allow: "encrypted-media; picture-in-picture; fullscreen",
        },
        children: [],
      };
    }
    return {
      tag: "video",
      attrs: {
        ...attrs,
        src: target.src,
        title: node.props.title,
        controls: "",
        preload: "metadata",
      },
      children: [],
    };
  },
};

const form: ElementDefinition<FormNode> = {
  baseCss: ".emvb-form{display:flex;flex-direction:column;gap:12px;min-width:0}",
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

const textInput: ElementDefinition<TextInputNode> = {
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

const textareaEl: ElementDefinition<TextareaNode> = {
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

const selectEl: ElementDefinition<SelectNode> = {
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

const checkbox: ElementDefinition<CheckboxNode> = {
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

const radio: ElementDefinition<RadioNode> = {
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

const submit: ElementDefinition<SubmitNode> = {
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

export const ELEMENTS = {
  heading,
  container,
  spacer,
  divider,
  text,
  label,
  link,
  button,
  list,
  image,
  icon,
  video,
  form,
  "text-input": textInput,
  textarea: textareaEl,
  select: selectEl,
  checkbox,
  radio,
  submit,
} as const;

export type ElementType = keyof typeof ELEMENTS;

export const ELEMENT_DESCRIPTORS: ElementDescriptor[] = Object.values(ELEMENTS).map(
  (el) => el.descriptor,
);

export function defaultElement<T extends ElementType>(
  type: T,
  id: string,
): (typeof ELEMENTS)[T] extends ElementDefinition<infer N> ? N : never {
  const base = ELEMENTS[type].defaults() as { type: string };
  return { id, ...base } as never;
}
