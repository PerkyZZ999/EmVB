import { z } from "zod";
import { DeviceStyles, HiddenOn, StyleProps, StyleStates } from "./style.ts";

/** 10 since W-138 (D-044): per-side border widths and per-corner radii. Older documents stay valid. */
export const DESIGN_SCHEMA_VERSION = 11;

/** Tags a site can give a starting style. Classes and local styles still win. */
export const DEFAULT_STYLE_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "a", "button"] as const;

export type DefaultStyleTag = (typeof DEFAULT_STYLE_TAGS)[number];

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
  states: StyleStates.optional(),
  devices: DeviceStyles.optional(),
  hiddenOn: HiddenOn.optional(),
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
  /** Starting styles for HTML tags, emitted under `:where(.emvb-root)` so a class still wins. */
  defaults: z
    .strictObject({
      h1: StyleProps.optional(),
      h2: StyleProps.optional(),
      h3: StyleProps.optional(),
      h4: StyleProps.optional(),
      h5: StyleProps.optional(),
      h6: StyleProps.optional(),
      p: StyleProps.optional(),
      a: StyleProps.optional(),
      button: StyleProps.optional(),
    })
    .optional(),
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
