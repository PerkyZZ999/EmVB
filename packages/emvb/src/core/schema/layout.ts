import { z } from "zod";
import { MAX_TEXT_LENGTH } from "../limits.ts";
import { DeviceStyles, HiddenOn, Length, StyleProps, StyleStates } from "./style.ts";

/**
 * 12 since W-160: gradient type, stop locations, and up to 10 stops. v11 gradients
 * (`{ angle, from, to }`) become a linear gradient on read.
 * 11 since W-156 and W-157 (D-045): the layout Section element and an editor-only node label.
 */
export const LAYOUT_SCHEMA_VERSION = 12;

export const NodeId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{4,24}$/, "Ids are 4-24 letters, digits, _ or -");
const ClassIds = z.array(z.string().regex(/^[a-z0-9-]{1,40}$/)).max(20);
/** CSS id attribute (Advanced). Letters first; unique on the page (checked in validateLayout). */
const HtmlId = z
  .string()
  .regex(
    /^[A-Za-z][A-Za-z0-9_-]{0,63}$/,
    "CSS ids start with a letter and are at most 64 characters",
  );

export const CONTAINER_TAGS = [
  "div",
  "section",
  "header",
  "footer",
  "main",
  "article",
  "aside",
  "nav",
] as const;
export const TEXT_TAGS = ["p", "div"] as const;

/** The editor-only name of a node in Layers (W-157, D-045). Never rendered on the page. */
const NodeLabel = z.string().trim().min(1).max(80);

/** `data-*` and `aria-*` only. Names stay unique on the element (W-105 / R-032). */
const HtmlAttribute = z.strictObject({
  name: z
    .string()
    .regex(
      /^(?:data|aria)-[a-z][a-z0-9-]{0,40}$/,
      "Use a data-* or aria-* name, starting with a letter",
    ),
  value: z.string().max(200),
});

const HtmlAttributes = z.array(HtmlAttribute).max(20);

/** A box may be the link. A link inside a link is dropped at render time (W-111). */
const BoxLink = {
  href: z.string().max(2000).optional(),
  newTab: z.boolean().optional(),
};

/** The fields every element has; `props` is the element's own strict props schema. */
const nodeFields = <T extends string, P extends z.ZodType>(type: T, props: P) => ({
  id: NodeId,
  type: z.literal(type),
  props,
  style: StyleProps.optional(),
  states: StyleStates.optional(),
  devices: DeviceStyles.optional(),
  hiddenOn: HiddenOn.optional(),
  classes: ClassIds.optional(),
  htmlId: HtmlId.optional(),
  attributes: HtmlAttributes.optional(),
  label: NodeLabel.optional(),
});

const leafNode = <T extends string, P extends z.ZodType>(type: T, props: P) =>
  z.strictObject(nodeFields(type, props));

const parentNode = <T extends string, P extends z.ZodType>(type: T, props: P) =>
  z.strictObject({
    ...nodeFields(type, props),
    get children(): z.ZodType<LayoutNode[]> {
      return z.array(LayoutNode);
    },
  });

export const HeadingNode = leafNode(
  "heading",
  z.strictObject({
    text: z.string().max(MAX_TEXT_LENGTH),
    level: z.number().int().min(1).max(6),
    /** Optional link around the text (W-141), like Elementor's Heading link. */
    href: z.string().max(2000).optional(),
    newTab: z.boolean().optional(),
  }),
);

export const SpacerNode = leafNode(
  "spacer",
  z.strictObject({
    height: Length,
  }),
);

export const DividerNode = leafNode("divider", z.strictObject({}));

export const TextNode = leafNode(
  "text",
  z.strictObject({
    text: z.string().max(MAX_TEXT_LENGTH),
    tag: z.enum(TEXT_TAGS).optional(),
  }),
);

export const LabelNode = leafNode(
  "label",
  z.strictObject({
    text: z.string().max(MAX_TEXT_LENGTH),
  }),
);

export const LinkNode = leafNode(
  "link",
  z.strictObject({
    text: z.string().max(MAX_TEXT_LENGTH),
    href: z.string().max(2000),
    newTab: z.boolean().optional(),
  }),
);

export const ButtonNode = leafNode(
  "button",
  z.strictObject({
    text: z.string().max(MAX_TEXT_LENGTH),
    href: z.string().max(2000).optional(),
    newTab: z.boolean().optional(),
  }),
);

export const ListNode = leafNode(
  "list",
  z.strictObject({
    ordered: z.boolean().optional(),
    items: z.array(z.string().max(MAX_TEXT_LENGTH)).max(200),
  }),
);

/** YouTube/Vimeo privacy embed or media-library video (W-026 / R-013). */
export const VideoNode = leafNode(
  "video",
  z.strictObject({
    url: z.string().max(2000),
    title: z.string().min(1).max(200),
    mediaId: z.string().min(1).max(128).optional(),
  }),
);

/** Bundled Lucide icon by id (W-025 / A-04). Unknown ids stay on save; renderer shows a placeholder. */
export const IconNode = leafNode(
  "icon",
  z.strictObject({
    iconId: z.string().min(1).max(64),
    size: z.number().int().positive().max(512).optional(),
    decorative: z.boolean().optional(),
    title: z.string().max(200).optional(),
    /** Optional link around the icon (W-141); the title names the link. */
    href: z.string().max(2000).optional(),
    newTab: z.boolean().optional(),
  }),
)
  .refine((node) => node.props.decorative === true || (node.props.title?.length ?? 0) > 0, {
    message: "Title is required unless the icon is marked decorative.",
    path: ["props", "title"],
  })
  .refine((node) => !node.props.href?.trim() || (node.props.title?.trim().length ?? 0) > 0, {
    message: "A linked icon needs a title: it names the link.",
    path: ["props", "title"],
  });

/** Image from the media library or a URL (W-024 / R-007). Alt required unless decorative. */
export const ImageNode = leafNode(
  "image",
  z.strictObject({
    src: z.string().max(2000),
    alt: z.string().max(500),
    decorative: z.boolean().optional(),
    width: z.number().int().positive().max(10000).optional(),
    height: z.number().int().positive().max(10000).optional(),
    mediaId: z.string().min(1).max(128).optional(),
  }),
).refine((node) => node.props.decorative === true || node.props.alt.length > 0, {
  message: "Alt text is required unless the image is marked decorative.",
  path: ["props", "alt"],
});

export const ContainerNode = parentNode(
  "container",
  z.strictObject({
    tag: z.enum(CONTAINER_TAGS).optional(),
    ...BoxLink,
  }),
);

/** Field name on a forms-plugin form (D-015). */
/** Form field names (W-202 checks them as you type with the same rule). */
export const FIELD_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
export const MAX_FIELD_NAME = 80;
const FieldName = z
  .string()
  .min(1)
  .max(MAX_FIELD_NAME)
  .regex(FIELD_NAME_PATTERN, "Field names start with a letter");

export const DivBlockNode = parentNode("div-block", z.strictObject({ ...BoxLink }));

/**
 * A layout Section (W-156, D-045): a full-width band whose contents sit in a centred inner box,
 * `contentWidth` wide at most (1140 px when unset), or the full width with `fullWidth`.
 */
export const LayoutSectionNode = parentNode(
  "layout-section",
  z.strictObject({
    tag: z.enum(CONTAINER_TAGS).optional(),
    contentWidth: Length.optional(),
    fullWidth: z.boolean().optional(),
  }),
);

export const FlexboxNode = parentNode("flexbox", z.strictObject({ ...BoxLink }));

/**
 * Equal columns. Children span with `gridColumnSpan` and `gridRowSpan` on their style. Tablet
 * and mobile may have their own count (W-139); unset follows the next wider device.
 */
export const GridNode = parentNode(
  "grid",
  z.strictObject({
    columns: z.number().int().min(1).max(12),
    columnsTablet: z.number().int().min(1).max(12).optional(),
    columnsMobile: z.number().int().min(1).max(12).optional(),
    ...BoxLink,
  }),
);

/** Several disclosures. Items are `<details>`, so the public page needs no script (W-106). */
export const AccordionNode = parentNode("accordion", z.strictObject({}));

export const AccordionItemNode = parentNode(
  "accordion-item",
  z.strictObject({
    summary: z.string().min(1).max(200),
    open: z.boolean().optional(),
  }),
);

/** A row or column of menu items. Dropdowns and wide panels are the items' children (W-162). */
export const MenuNode = parentNode(
  "menu",
  z.strictObject({
    direction: z.enum(["row", "column"]),
    /** Names the navigation landmark. Omitted uses "Menu". */
    label: z.string().max(80).optional(),
  }),
);

/** A link, and, when it has children, the dropdown or wide panel under it. */
export const MenuItemNode = parentNode(
  "menu-item",
  z.strictObject({
    text: z.string().min(1).max(MAX_TEXT_LENGTH),
    href: z.string().max(2000).optional(),
    newTab: z.boolean().optional(),
    /** The panel stretches across the menu instead of sitting under the item. */
    wide: z.boolean().optional(),
  }),
);

export const SvgNode = leafNode(
  "svg",
  z.strictObject({
    /** Sanitized SVG markup (allowlisted tags/attrs only). */
    markup: z.string().max(32768),
    title: z.string().max(MAX_TEXT_LENGTH).optional(),
    decorative: z.boolean().optional(),
    size: z.number().int().positive().max(2048).optional(),
  }),
);

export const TabPanelNode = parentNode(
  "tab-panel",
  z.strictObject({
    label: z.string().min(1).max(MAX_TEXT_LENGTH),
  }),
);

const TabsNodeSchema = parentNode("tabs", z.strictObject({}));

export const FORM_FIELD_TYPES = [
  "text-input",
  "textarea",
  "select",
  "checkbox",
  "radio",
  "submit",
] as const;

export const FormNode = parentNode(
  "form",
  z.strictObject({
    /** Empty until the editor binds a forms-plugin form (W-036). */
    formId: z.string().max(64),
  }),
);

const InputFieldProps = z.strictObject({
  field: FieldName,
  label: z.string().max(200).optional(),
  placeholder: z.string().max(200).optional(),
});

export const TextInputNode = leafNode("text-input", InputFieldProps);

export const TextareaNode = leafNode("textarea", InputFieldProps);

export const SelectNode = leafNode("select", InputFieldProps);

export const CheckboxNode = leafNode(
  "checkbox",
  z.strictObject({
    field: FieldName,
    label: z.string().max(200).optional(),
  }),
);

export const RadioNode = leafNode("radio", InputFieldProps);

export const SubmitNode = leafNode(
  "submit",
  z.strictObject({
    label: z.string().min(1).max(80).optional(),
  }),
);

/** Dynamic post title from ThemeDynamicData (S7d). */
export const PostTitleNode = leafNode(
  "post-title",
  z.strictObject({
    level: z.number().int().min(1).max(6).optional(),
  }),
);

/** Dynamic post excerpt (escaped text). `maxWords` cuts it to that many words, with "…" (W-177). */
export const PostExcerptNode = leafNode(
  "post-excerpt",
  z.strictObject({ maxWords: z.number().int().positive().max(10_000).optional() }),
);

/** Dynamic post body from Portable Text / string (sanitized via VNode serialize). */
export const PostContentNode = leafNode("post-content", z.strictObject({}));

/** Dynamic featured image when a URL is available. */
export const PostImageNode = leafNode(
  "post-image",
  z.strictObject({
    decorative: z.boolean().optional(),
  }),
);

/** How a Post Date reads (W-177). Unset is `medium`. `numeric` is YYYY-MM-DD. */
export const POST_DATE_FORMATS = ["medium", "short", "long", "full", "numeric"] as const;

/** Published date from the post, shown as a `<time>` element (W-108). */
export const PostDateNode = leafNode(
  "post-date",
  z.strictObject({ format: z.enum(POST_DATE_FORMATS).optional() }),
);

/** Author name from the post (W-108). */
export const PostAuthorNode = leafNode("post-author", z.strictObject({}));

/** Permalink link; empty text uses the post title. */
export const PostLinkNode = leafNode(
  "post-link",
  z.strictObject({
    text: z.string().max(MAX_TEXT_LENGTH).optional(),
    newTab: z.boolean().optional(),
  }),
);

/**
 * Repeats its item template for each post in ThemeDynamicData.posts.
 * When `itemPartId` is set, the host supplies that Loop Item layout in loopTemplates;
 * otherwise children are the inline item template.
 */
export const LoopNode = parentNode(
  "loop",
  z.strictObject({
    itemPartId: z.string().max(128).optional(),
    /** Posts per archive page, 1–50 (W-221). Unset = 20. */
    perPage: z.number().int().min(1).max(50).optional(),
  }),
);

/**
 * Previous / page numbers / Next links for an archive (W-222). Renders only on an archive with
 * more than one page; the host supplies `ThemeDynamicData.pagination`.
 */
export const PaginationNode = leafNode(
  "pagination",
  z.strictObject({
    prevText: z.string().max(40).optional(),
    nextText: z.string().max(40).optional(),
  }),
);

/**
 * A reusable block. When `partId` is set, the host supplies that Section theme part in
 * `sectionTemplates` and the part's children render in place of `children`.
 */
export const SectionNode = parentNode(
  "section",
  z.strictObject({
    partId: z.string().max(128).optional(),
  }),
);

/** Known element type strings (everything else is an UnknownNode). */
export const KNOWN_ELEMENT_TYPES = [
  "container",
  "heading",
  "spacer",
  "divider",
  "text",
  "label",
  "link",
  "button",
  "list",
  "image",
  "icon",
  "video",
  "form",
  "text-input",
  "textarea",
  "select",
  "checkbox",
  "radio",
  "submit",
  "post-title",
  "post-excerpt",
  "post-content",
  "post-image",
  "post-link",
  "post-date",
  "post-author",
  "loop",
  "pagination",
  "section",
  "div-block",
  "flexbox",
  "grid",
  "svg",
  "tabs",
  "tab-panel",
  "accordion",
  "accordion-item",
  "menu",
  "menu-item",
  "layout-section",
] as const;

const knownTypeSet = new Set<string>(KNOWN_ELEMENT_TYPES);

/**
 * A node whose `type` EmVB does not implement yet (W-022 / R-033). Kept on save so a newer
 * plugin version can reclaim it; public pages omit it; the editor shows a placeholder.
 */
const UnknownNodeSchema = z.strictObject({
  id: NodeId,
  type: z
    .string()
    .min(1)
    .max(64)
    .refine((value) => !knownTypeSet.has(value), "Unknown element type"),
  props: z.record(z.string(), z.unknown()),
  style: StyleProps.optional(),
  states: StyleStates.optional(),
  classes: ClassIds.optional(),
  htmlId: HtmlId.optional(),
  attributes: HtmlAttributes.optional(),
  label: NodeLabel.optional(),
  get children(): z.ZodType<LayoutNode[] | undefined> {
    return z.array(LayoutNode).optional();
  },
});

const KnownLayoutNode = z.discriminatedUnion("type", [
  ContainerNode,
  DivBlockNode,
  LayoutSectionNode,
  FlexboxNode,
  GridNode,
  SvgNode,
  TabsNodeSchema,
  TabPanelNode,
  HeadingNode,
  SpacerNode,
  DividerNode,
  TextNode,
  LabelNode,
  LinkNode,
  ButtonNode,
  ListNode,
  ImageNode,
  IconNode,
  VideoNode,
  FormNode,
  TextInputNode,
  TextareaNode,
  SelectNode,
  CheckboxNode,
  RadioNode,
  SubmitNode,
  PostTitleNode,
  PostExcerptNode,
  PostContentNode,
  PostImageNode,
  PostLinkNode,
  PostDateNode,
  PostAuthorNode,
  LoopNode,
  PaginationNode,
  SectionNode,
  AccordionNode,
  AccordionItemNode,
  MenuNode,
  MenuItemNode,
]);

export type HeadingNode = z.infer<typeof HeadingNode>;
export type SpacerNode = z.infer<typeof SpacerNode>;
export type DividerNode = z.infer<typeof DividerNode>;
export type TextNode = z.infer<typeof TextNode>;
export type LabelNode = z.infer<typeof LabelNode>;
export type LinkNode = z.infer<typeof LinkNode>;
export type ButtonNode = z.infer<typeof ButtonNode>;
export type ListNode = z.infer<typeof ListNode>;
export type ImageNode = z.infer<typeof ImageNode>;
export type IconNode = z.infer<typeof IconNode>;
export type VideoNode = z.infer<typeof VideoNode>;
export type TextInputNode = z.infer<typeof TextInputNode>;
export type TextareaNode = z.infer<typeof TextareaNode>;
export type SelectNode = z.infer<typeof SelectNode>;
export type CheckboxNode = z.infer<typeof CheckboxNode>;
export type RadioNode = z.infer<typeof RadioNode>;
export type SubmitNode = z.infer<typeof SubmitNode>;
export type PostTitleNode = z.infer<typeof PostTitleNode>;
export type PostExcerptNode = z.infer<typeof PostExcerptNode>;
export type PostContentNode = z.infer<typeof PostContentNode>;
export type PostImageNode = z.infer<typeof PostImageNode>;
export type PostLinkNode = z.infer<typeof PostLinkNode>;
export type PaginationNode = z.infer<typeof PaginationNode>;
export type PostDateNode = z.infer<typeof PostDateNode>;
export type PostAuthorNode = z.infer<typeof PostAuthorNode>;

type StyleOf = z.infer<typeof StyleProps>;
type StatesOf = z.infer<typeof StyleStates>;
type DevicesOf = z.infer<typeof DeviceStyles>;
type HiddenOnOf = z.infer<typeof HiddenOn>;
type ClassesOf = z.infer<typeof ClassIds>;
type HtmlIdOf = z.infer<typeof HtmlId>;
type HtmlAttributeOf = z.infer<typeof HtmlAttribute>;
type IdOf = z.infer<typeof NodeId>;

/** Manual recursive types so UnknownNode does not poison `z.infer` of the tree. */
export type UnknownNode = {
  id: IdOf;
  type: string;
  props: Record<string, unknown>;
  style?: StyleOf;
  states?: StatesOf;
  devices?: DevicesOf;
  hiddenOn?: HiddenOnOf;
  classes?: ClassesOf;
  htmlId?: HtmlIdOf;
  attributes?: HtmlAttributeOf[];
  label?: string;
  children?: LayoutNode[];
};

export type ContainerNode = {
  id: IdOf;
  type: "container";
  props: { tag?: (typeof CONTAINER_TAGS)[number]; href?: string; newTab?: boolean };
  style?: StyleOf;
  states?: StatesOf;
  devices?: DevicesOf;
  hiddenOn?: HiddenOnOf;
  classes?: ClassesOf;
  htmlId?: HtmlIdOf;
  attributes?: HtmlAttributeOf[];
  label?: string;
  children: LayoutNode[];
};

export type DivBlockNode = {
  id: IdOf;
  type: "div-block";
  props: { href?: string; newTab?: boolean };
  style?: StyleOf;
  states?: StatesOf;
  devices?: DevicesOf;
  hiddenOn?: HiddenOnOf;
  classes?: ClassesOf;
  htmlId?: HtmlIdOf;
  attributes?: HtmlAttributeOf[];
  label?: string;
  children: LayoutNode[];
};

export type LayoutSectionNode = {
  id: IdOf;
  type: "layout-section";
  props: {
    tag?: (typeof CONTAINER_TAGS)[number];
    contentWidth?: z.infer<typeof Length>;
    fullWidth?: boolean;
  };
  style?: StyleOf;
  states?: StatesOf;
  devices?: DevicesOf;
  hiddenOn?: HiddenOnOf;
  classes?: ClassesOf;
  htmlId?: HtmlIdOf;
  attributes?: HtmlAttributeOf[];
  label?: string;
  children: LayoutNode[];
};

export type GridNode = {
  id: IdOf;
  type: "grid";
  props: {
    columns: number;
    columnsTablet?: number;
    columnsMobile?: number;
    href?: string;
    newTab?: boolean;
  };
  style?: StyleOf;
  states?: StatesOf;
  devices?: DevicesOf;
  hiddenOn?: HiddenOnOf;
  classes?: ClassesOf;
  htmlId?: HtmlIdOf;
  attributes?: HtmlAttributeOf[];
  label?: string;
  children: LayoutNode[];
};

export type FlexboxNode = {
  id: IdOf;
  type: "flexbox";
  props: { href?: string; newTab?: boolean };
  style?: StyleOf;
  states?: StatesOf;
  devices?: DevicesOf;
  hiddenOn?: HiddenOnOf;
  classes?: ClassesOf;
  htmlId?: HtmlIdOf;
  attributes?: HtmlAttributeOf[];
  label?: string;
  children: LayoutNode[];
};

export type SvgNode = {
  id: IdOf;
  type: "svg";
  props: {
    markup: string;
    title?: string;
    decorative?: boolean;
    size?: number;
  };
  style?: StyleOf;
  states?: StatesOf;
  devices?: DevicesOf;
  hiddenOn?: HiddenOnOf;
  classes?: ClassesOf;
  htmlId?: HtmlIdOf;
  attributes?: HtmlAttributeOf[];
  label?: string;
};

export type TabPanelNode = {
  id: IdOf;
  type: "tab-panel";
  props: { label: string };
  style?: StyleOf;
  states?: StatesOf;
  devices?: DevicesOf;
  hiddenOn?: HiddenOnOf;
  classes?: ClassesOf;
  htmlId?: HtmlIdOf;
  attributes?: HtmlAttributeOf[];
  label?: string;
  children: LayoutNode[];
};

export type TabsNode = {
  id: IdOf;
  type: "tabs";
  props: { href?: string; newTab?: boolean };
  style?: StyleOf;
  states?: StatesOf;
  devices?: DevicesOf;
  hiddenOn?: HiddenOnOf;
  classes?: ClassesOf;
  htmlId?: HtmlIdOf;
  attributes?: HtmlAttributeOf[];
  label?: string;
  children: LayoutNode[];
};

export type FormNode = {
  id: IdOf;
  type: "form";
  props: { formId: string };
  style?: StyleOf;
  states?: StatesOf;
  devices?: DevicesOf;
  hiddenOn?: HiddenOnOf;
  classes?: ClassesOf;
  htmlId?: HtmlIdOf;
  attributes?: HtmlAttributeOf[];
  label?: string;
  children: LayoutNode[];
};

export type LoopNode = {
  id: IdOf;
  type: "loop";
  props: { itemPartId?: string; perPage?: number };
  style?: StyleOf;
  states?: StatesOf;
  devices?: DevicesOf;
  hiddenOn?: HiddenOnOf;
  classes?: ClassesOf;
  htmlId?: HtmlIdOf;
  attributes?: HtmlAttributeOf[];
  label?: string;
  children: LayoutNode[];
};

export type SectionNode = {
  id: IdOf;
  type: "section";
  props: { partId?: string };
  style?: StyleOf;
  states?: StatesOf;
  devices?: DevicesOf;
  hiddenOn?: HiddenOnOf;
  classes?: ClassesOf;
  htmlId?: HtmlIdOf;
  attributes?: HtmlAttributeOf[];
  label?: string;
  children: LayoutNode[];
};

export type AccordionNode = {
  id: IdOf;
  type: "accordion";
  props: Record<string, never>;
  style?: StyleOf;
  states?: StatesOf;
  devices?: DevicesOf;
  hiddenOn?: HiddenOnOf;
  classes?: ClassesOf;
  htmlId?: HtmlIdOf;
  attributes?: HtmlAttributeOf[];
  label?: string;
  children: LayoutNode[];
};

export type MenuNode = {
  id: IdOf;
  type: "menu";
  props: { direction: "row" | "column"; label?: string };
  style?: StyleOf;
  states?: StatesOf;
  devices?: DevicesOf;
  hiddenOn?: HiddenOnOf;
  classes?: ClassesOf;
  htmlId?: HtmlIdOf;
  attributes?: HtmlAttributeOf[];
  label?: string;
  children: LayoutNode[];
};

export type MenuItemNode = {
  id: IdOf;
  type: "menu-item";
  props: { text: string; href?: string; newTab?: boolean; wide?: boolean };
  style?: StyleOf;
  states?: StatesOf;
  devices?: DevicesOf;
  hiddenOn?: HiddenOnOf;
  classes?: ClassesOf;
  htmlId?: HtmlIdOf;
  attributes?: HtmlAttributeOf[];
  label?: string;
  children: LayoutNode[];
};

export type AccordionItemNode = {
  id: IdOf;
  type: "accordion-item";
  props: { summary: string; open?: boolean };
  style?: StyleOf;
  states?: StatesOf;
  devices?: DevicesOf;
  hiddenOn?: HiddenOnOf;
  classes?: ClassesOf;
  htmlId?: HtmlIdOf;
  attributes?: HtmlAttributeOf[];
  label?: string;
  children: LayoutNode[];
};

export type LayoutNode =
  | ContainerNode
  | DivBlockNode
  | LayoutSectionNode
  | FlexboxNode
  | GridNode
  | SvgNode
  | TabsNode
  | TabPanelNode
  | FormNode
  | LoopNode
  | SectionNode
  | HeadingNode
  | SpacerNode
  | DividerNode
  | TextNode
  | LabelNode
  | LinkNode
  | ButtonNode
  | ListNode
  | ImageNode
  | IconNode
  | VideoNode
  | TextInputNode
  | TextareaNode
  | SelectNode
  | CheckboxNode
  | RadioNode
  | SubmitNode
  | PostTitleNode
  | PostExcerptNode
  | PostContentNode
  | PostImageNode
  | PostLinkNode
  | PostDateNode
  | PostAuthorNode
  | PaginationNode
  | AccordionNode
  | AccordionItemNode
  | MenuNode
  | MenuItemNode
  | UnknownNode;

/**
 * Prefer the known-type schema when `type` is registered so path-specific Zod issues stay
 * intact; only fall through to UnknownNode for types EmVB does not implement (W-022 / R-033).
 * A plain `z.union` would collapse every known-type failure into `invalid_union`.
 */
const LayoutNode: z.ZodType<LayoutNode> = z.lazy(() =>
  z.unknown().transform((input, ctx) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      ctx.addIssue({ code: "invalid_type", expected: "object", path: [] });
      return z.NEVER;
    }
    const type = (input as { type?: unknown }).type;
    if (typeof type !== "string") {
      // `input` is the type itself; without it Zod describes the whole node ("received object").
      ctx.addIssue({ code: "invalid_type", expected: "string", input: type, path: ["type"] });
      return z.NEVER;
    }
    const result = knownTypeSet.has(type)
      ? KnownLayoutNode.safeParse(input)
      : UnknownNodeSchema.safeParse(input);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
          params: { zodCode: issue.code },
        });
      }
      return z.NEVER;
    }
    return result.data as LayoutNode;
  }),
);

export const Layout = z.strictObject({
  schemaVersion: z.literal(LAYOUT_SCHEMA_VERSION),
  root: ContainerNode,
});

export type Layout = {
  schemaVersion: typeof LAYOUT_SCHEMA_VERSION;
  root: ContainerNode;
};

export const isContainerNode = (node: LayoutNode): node is ContainerNode =>
  node.type === "container";

export const isFormNode = (node: LayoutNode): node is FormNode => node.type === "form";

export const isLoopNode = (node: LayoutNode): node is LoopNode => node.type === "loop";

export const isSectionNode = (node: LayoutNode): node is SectionNode => node.type === "section";

export const isDivBlockNode = (node: LayoutNode): node is DivBlockNode => node.type === "div-block";

export const isFlexboxNode = (node: LayoutNode): node is FlexboxNode => node.type === "flexbox";

/** Layout parents that accept general children (not form-only / tabs-only). */
export const isTabsNode = (node: LayoutNode): node is TabsNode => node.type === "tabs";

export const isTabPanelNode = (node: LayoutNode): node is TabPanelNode => node.type === "tab-panel";

/** Layout parents that accept general children (forms may land here). */
export const isLayoutParentNode = (
  node: LayoutNode,
): node is
  | ContainerNode
  | DivBlockNode
  | LayoutSectionNode
  | FlexboxNode
  | GridNode
  | TabPanelNode
  | SectionNode
  | AccordionItemNode
  | MenuItemNode =>
  node.type === "container" ||
  node.type === "div-block" ||
  node.type === "layout-section" ||
  node.type === "flexbox" ||
  node.type === "grid" ||
  node.type === "tab-panel" ||
  node.type === "section" ||
  node.type === "accordion-item" ||
  node.type === "menu-item";

/** Nodes that may hold children. */
export const isParentNode = (
  node: LayoutNode,
): node is
  | ContainerNode
  | DivBlockNode
  | LayoutSectionNode
  | FlexboxNode
  | GridNode
  | FormNode
  | LoopNode
  | SectionNode
  | TabsNode
  | TabPanelNode
  | AccordionNode
  | AccordionItemNode
  | MenuNode
  | MenuItemNode =>
  node.type === "container" ||
  node.type === "div-block" ||
  node.type === "layout-section" ||
  node.type === "flexbox" ||
  node.type === "grid" ||
  node.type === "form" ||
  node.type === "loop" ||
  node.type === "section" ||
  node.type === "tabs" ||
  node.type === "tab-panel" ||
  node.type === "accordion" ||
  node.type === "accordion-item" ||
  node.type === "menu" ||
  node.type === "menu-item";

export const isFormFieldType = (type: string): boolean =>
  (FORM_FIELD_TYPES as readonly string[]).includes(type);

export const isHeadingNode = (node: LayoutNode): node is HeadingNode => node.type === "heading";

export const isUnknownNode = (node: LayoutNode): node is UnknownNode =>
  !knownTypeSet.has(node.type);
