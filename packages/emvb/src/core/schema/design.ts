import { z } from "zod";
import { StyleProps } from "./style.ts";

/** 2 since W-088 (D-031), like the layout: class styles may use the W-088 keys. */
export const DESIGN_SCHEMA_VERSION = 2;

const VariableId = z
  .string()
  .regex(/^[a-z0-9-]{1,40}$/, "Ids are 1-40 lowercase letters, digits or -");

export const ColorVariable = z.strictObject({
  id: VariableId,
  name: z.string().min(1).max(60),
  value: z
    .string()
    .regex(
      /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i,
      "Use a hex color such as #1a2b3c",
    ),
});

/** Font stack string — commas and quoted family names allowed; `generateCss` drops an unsafe one. */
export const FontVariable = z.strictObject({
  id: VariableId,
  name: z.string().min(1).max(60),
  value: z.string().min(1).max(200),
});

export const LengthVariable = z.strictObject({
  id: VariableId,
  name: z.string().min(1).max(60),
  value: z.strictObject({
    value: z.number().finite().min(0).max(10_000),
    unit: z.enum(["px", "rem", "em", "%"]),
  }),
});

/** Shared style class (R-021 / W-030). CSS selector is always `.emvb-k-<id>`. */
const StyleClass = z.strictObject({
  id: VariableId,
  name: z.string().min(1).max(60),
  style: StyleProps,
});

/** Design system document (D-013 / W-028 / W-030). */
export const DesignSystem = z.strictObject({
  schemaVersion: z.literal(DESIGN_SCHEMA_VERSION),
  variables: z.strictObject({
    colors: z.array(ColorVariable).max(200),
    fonts: z.array(FontVariable).max(50).optional(),
    fontSizes: z.array(LengthVariable).max(50).optional(),
    spacings: z.array(LengthVariable).max(100).optional(),
  }),
  classes: z.array(StyleClass).max(100).optional(),
});

export type ColorVariable = z.infer<typeof ColorVariable>;
export type FontVariable = z.infer<typeof FontVariable>;
export type LengthVariable = z.infer<typeof LengthVariable>;
export type DesignSystem = z.infer<typeof DesignSystem>;

export const emptyDesign = (): DesignSystem => ({
  schemaVersion: DESIGN_SCHEMA_VERSION,
  variables: { colors: [], fonts: [], fontSizes: [], spacings: [] },
  classes: [],
});
