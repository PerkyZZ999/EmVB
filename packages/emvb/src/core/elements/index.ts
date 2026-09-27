import type {
  ButtonNode,
  ContainerNode,
  DividerNode,
  HeadingNode,
  ImageNode,
  LabelNode,
  LinkNode,
  ListNode,
  SpacerNode,
  TextNode,
} from "../schema/layout.ts";
import { CONTAINER_TAGS, TEXT_TAGS } from "../schema/layout.ts";
import type { ElementDescriptor } from "../schema/descriptors.ts";
import { sanitizeHref } from "../sanitize/href.ts";
import { sanitizeMediaUrl } from "../sanitize/media-url.ts";
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
        kind: "href",
        label: "Image URL",
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
        kind: "number",
        label: "Width (px)",
        optional: true,
        message: "Width must be a positive whole number.",
      },
      {
        key: "height",
        kind: "number",
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
