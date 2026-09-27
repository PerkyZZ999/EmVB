import { z } from "zod";

export const VariableRef = z.strictObject({ var: z.string().regex(/^[a-z0-9-]{1,40}$/) });

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
export const ColorValue = z.union([
  z.string().regex(HEX_COLOR, "Use a hex color such as #1a2b3c"),
  VariableRef,
]);

export const Length = z.strictObject({
  value: z.number().finite().min(0).max(10_000),
  unit: z.enum(["px", "rem", "em", "%"]),
});

/** Style properties available in schema v1 (grows per slice; unknown keys are rejected). */
export const StyleProps = z.strictObject({
  flexDirection: z.enum(["row", "column", "row-reverse", "column-reverse"]).optional(),
  gap: Length.optional(),
  color: ColorValue.optional(),
});

export type StyleProps = z.infer<typeof StyleProps>;
