import { z } from "zod";

export const DESIGN_SCHEMA_VERSION = 1;

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

/** Font stack string — commas and quotes allowed; CSS injection chars refused downstream. */
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

/** Design system document (D-013 / W-028). Classes join in W-030. */
export const DesignSystem = z.strictObject({
  schemaVersion: z.literal(DESIGN_SCHEMA_VERSION),
  variables: z.strictObject({
    colors: z.array(ColorVariable).max(200),
    fonts: z.array(FontVariable).max(50).optional(),
    fontSizes: z.array(LengthVariable).max(50).optional(),
    spacings: z.array(LengthVariable).max(100).optional(),
  }),
});

export type ColorVariable = z.infer<typeof ColorVariable>;
export type FontVariable = z.infer<typeof FontVariable>;
export type LengthVariable = z.infer<typeof LengthVariable>;
export type DesignSystem = z.infer<typeof DesignSystem>;

export const emptyDesign = (): DesignSystem => ({
  schemaVersion: DESIGN_SCHEMA_VERSION,
  variables: { colors: [], fonts: [], fontSizes: [], spacings: [] },
});
