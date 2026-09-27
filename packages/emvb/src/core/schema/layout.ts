import { z } from "zod";
import { MAX_TEXT_LENGTH } from "../limits.ts";
import { Length, StyleProps } from "./style.ts";

export const LAYOUT_SCHEMA_VERSION = 1;

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

export const HeadingNode = z.strictObject({
  id: NodeId,
  type: z.literal("heading"),
  props: z.strictObject({
    text: z.string().max(MAX_TEXT_LENGTH),
    level: z.number().int().min(1).max(6),
  }),
  style: StyleProps.optional(),
  classes: ClassIds.optional(),
  htmlId: HtmlId.optional(),
});

export const SpacerNode = z.strictObject({
  id: NodeId,
  type: z.literal("spacer"),
  props: z.strictObject({
    height: Length,
  }),
  style: StyleProps.optional(),
  classes: ClassIds.optional(),
  htmlId: HtmlId.optional(),
});

export const DividerNode = z.strictObject({
  id: NodeId,
  type: z.literal("divider"),
  props: z.strictObject({}),
  style: StyleProps.optional(),
  classes: ClassIds.optional(),
  htmlId: HtmlId.optional(),
});

export const TextNode = z.strictObject({
  id: NodeId,
  type: z.literal("text"),
  props: z.strictObject({
    text: z.string().max(MAX_TEXT_LENGTH),
    tag: z.enum(TEXT_TAGS).optional(),
  }),
  style: StyleProps.optional(),
  classes: ClassIds.optional(),
  htmlId: HtmlId.optional(),
});

export const LabelNode = z.strictObject({
  id: NodeId,
  type: z.literal("label"),
  props: z.strictObject({
    text: z.string().max(MAX_TEXT_LENGTH),
  }),
  style: StyleProps.optional(),
  classes: ClassIds.optional(),
  htmlId: HtmlId.optional(),
});

export const LinkNode = z.strictObject({
  id: NodeId,
  type: z.literal("link"),
  props: z.strictObject({
    text: z.string().max(MAX_TEXT_LENGTH),
    href: z.string().max(2000),
    newTab: z.boolean().optional(),
  }),
  style: StyleProps.optional(),
  classes: ClassIds.optional(),
  htmlId: HtmlId.optional(),
});

export const ButtonNode = z.strictObject({
  id: NodeId,
  type: z.literal("button"),
  props: z.strictObject({
    text: z.string().max(MAX_TEXT_LENGTH),
    href: z.string().max(2000).optional(),
    newTab: z.boolean().optional(),
  }),
  style: StyleProps.optional(),
  classes: ClassIds.optional(),
  htmlId: HtmlId.optional(),
});

export const ListNode = z.strictObject({
  id: NodeId,
  type: z.literal("list"),
  props: z.strictObject({
    ordered: z.boolean().optional(),
    items: z.array(z.string().max(MAX_TEXT_LENGTH)).max(200),
  }),
  style: StyleProps.optional(),
  classes: ClassIds.optional(),
  htmlId: HtmlId.optional(),
});

export const ContainerNode = z.strictObject({
  id: NodeId,
  type: z.literal("container"),
  props: z.strictObject({
    tag: z.enum(CONTAINER_TAGS).optional(),
  }),
  style: StyleProps.optional(),
  classes: ClassIds.optional(),
  htmlId: HtmlId.optional(),
  get children() {
    return z.array(LayoutNode);
  },
});

const LayoutNode = z.discriminatedUnion("type", [
  ContainerNode,
  HeadingNode,
  SpacerNode,
  DividerNode,
  TextNode,
  LabelNode,
  LinkNode,
  ButtonNode,
  ListNode,
]);

export const Layout = z.strictObject({
  schemaVersion: z.literal(LAYOUT_SCHEMA_VERSION),
  root: ContainerNode,
});

export type HeadingNode = z.infer<typeof HeadingNode>;
export type SpacerNode = z.infer<typeof SpacerNode>;
export type DividerNode = z.infer<typeof DividerNode>;
export type TextNode = z.infer<typeof TextNode>;
export type LabelNode = z.infer<typeof LabelNode>;
export type LinkNode = z.infer<typeof LinkNode>;
export type ButtonNode = z.infer<typeof ButtonNode>;
export type ListNode = z.infer<typeof ListNode>;
export type ContainerNode = z.infer<typeof ContainerNode>;
export type LayoutNode = z.infer<typeof LayoutNode>;
export type Layout = z.infer<typeof Layout>;
