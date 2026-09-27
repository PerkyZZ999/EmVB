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

/** Design system document (D-013). Fonts, sizes and classes join in later slices. */
export const DesignSystem = z.strictObject({
  schemaVersion: z.literal(DESIGN_SCHEMA_VERSION),
  variables: z.strictObject({ colors: z.array(ColorVariable).max(200) }),
});

export type ColorVariable = z.infer<typeof ColorVariable>;
export type DesignSystem = z.infer<typeof DesignSystem>;

export const emptyDesign = (): DesignSystem => ({
  schemaVersion: DESIGN_SCHEMA_VERSION,
  variables: { colors: [] },
});
