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

/** Style properties for layout and text elements (W-017 / R-012). Unknown keys are rejected. */
export const StyleProps = z.strictObject({
  flexDirection: z.enum(["row", "column", "row-reverse", "column-reverse"]).optional(),
  flexWrap: z.enum(["nowrap", "wrap", "wrap-reverse"]).optional(),
  justifyContent: z
    .enum(["flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly"])
    .optional(),
  alignItems: z.enum(["stretch", "flex-start", "flex-end", "center", "baseline"]).optional(),
  gap: Length.optional(),
  width: Length.optional(),
  minWidth: Length.optional(),
  maxWidth: Length.optional(),
  height: Length.optional(),
  minHeight: Length.optional(),
  paddingTop: Length.optional(),
  paddingRight: Length.optional(),
  paddingBottom: Length.optional(),
  paddingLeft: Length.optional(),
  marginTop: Length.optional(),
  marginRight: Length.optional(),
  marginBottom: Length.optional(),
  marginLeft: Length.optional(),
  fontSize: Length.optional(),
  fontWeight: z
    .union([
      z.literal(400),
      z.literal(500),
      z.literal(600),
      z.literal(700),
      z.enum(["normal", "bold"]),
    ])
    .optional(),
  lineHeight: Length.optional(),
  letterSpacing: Length.optional(),
  textAlign: z.enum(["left", "center", "right", "justify"]).optional(),
  textTransform: z.enum(["none", "uppercase", "lowercase", "capitalize"]).optional(),
  color: ColorValue.optional(),
  backgroundColor: ColorValue.optional(),
  borderWidth: Length.optional(),
  borderStyle: z.enum(["none", "solid", "dashed", "dotted"]).optional(),
  borderColor: ColorValue.optional(),
  borderRadius: Length.optional(),
});

export type StyleProps = z.infer<typeof StyleProps>;
