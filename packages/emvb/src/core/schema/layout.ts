import { z } from "zod";
import { MAX_TEXT_LENGTH } from "../limits.ts";
import { StyleProps } from "./style.ts";

export const LAYOUT_SCHEMA_VERSION = 1;

export const NodeId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{4,24}$/, "Ids are 4-24 letters, digits, _ or -");
const ClassIds = z.array(z.string().regex(/^[a-z0-9-]{1,40}$/)).max(20);

export const HeadingNode = z.strictObject({
  id: NodeId,
  type: z.literal("heading"),
  props: z.strictObject({
    text: z.string().max(MAX_TEXT_LENGTH),
    level: z.number().int().min(1).max(6),
  }),
  style: StyleProps.optional(),
  classes: ClassIds.optional(),
});

export const ContainerNode = z.strictObject({
  id: NodeId,
  type: z.literal("container"),
  props: z.strictObject({}),
  style: StyleProps.optional(),
  classes: ClassIds.optional(),
  get children() {
    return z.array(LayoutNode);
  },
});

const LayoutNode = z.discriminatedUnion("type", [ContainerNode, HeadingNode]);

export const Layout = z.strictObject({
  schemaVersion: z.literal(LAYOUT_SCHEMA_VERSION),
  root: ContainerNode,
});

export type HeadingNode = z.infer<typeof HeadingNode>;
export type ContainerNode = z.infer<typeof ContainerNode>;
export type LayoutNode = z.infer<typeof LayoutNode>;
export type Layout = z.infer<typeof Layout>;
