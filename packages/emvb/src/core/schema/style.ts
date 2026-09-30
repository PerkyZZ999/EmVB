import { z } from "zod";
import { isSafeFontStack } from "../sanitize/css.ts";

/** Colour refs omit `from` (legacy). Length/font refs set `from` (W-028). */
export const VariableRef = z.strictObject({
  var: z.string().regex(/^[a-z0-9-]{1,40}$/),
  from: z.enum(["color", "font", "fontSize", "spacing"]).optional(),
});

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
export const ColorValue = z.union([
  z.string().regex(HEX_COLOR, "Use a hex color such as #1a2b3c"),
  VariableRef,
]);

const LengthUnit = z.enum(["px", "rem", "em", "%", "vw", "vh"]);

export const Length = z.strictObject({
  value: z.number().finite().min(0).max(10_000),
  unit: LengthUnit,
});

/** Literal length or a fontSize/spacing variable reference. */
export const LengthValue = z.union([Length, VariableRef]);

/** Width, height and margins may also be `auto` (W-088). */
const SizeValue = z.union([Length, VariableRef, z.literal("auto")]);

/** Style properties for layout and text elements (W-017 / R-012). Unknown keys are rejected. */
export const StyleProps = z.strictObject({
  flexDirection: z.enum(["row", "column", "row-reverse", "column-reverse"]).optional(),
  flexWrap: z.enum(["nowrap", "wrap", "wrap-reverse"]).optional(),
  justifyContent: z
    .enum(["flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly"])
    .optional(),
  alignItems: z.enum(["stretch", "flex-start", "flex-end", "center", "baseline"]).optional(),
  gap: LengthValue.optional(),
  width: SizeValue.optional(),
  minWidth: LengthValue.optional(),
  maxWidth: LengthValue.optional(),
  height: SizeValue.optional(),
  minHeight: LengthValue.optional(),
  paddingTop: LengthValue.optional(),
  paddingRight: LengthValue.optional(),
  paddingBottom: LengthValue.optional(),
  paddingLeft: LengthValue.optional(),
  marginTop: SizeValue.optional(),
  marginRight: SizeValue.optional(),
  marginBottom: SizeValue.optional(),
  marginLeft: SizeValue.optional(),
  fontFamily: z
    .union([
      z.string().min(1).max(200).refine(isSafeFontStack, "Font stack looks unsafe."),
      VariableRef,
    ])
    .optional(),
  fontSize: LengthValue.optional(),
  fontWeight: z
    .union([
      z.literal(400),
      z.literal(500),
      z.literal(600),
      z.literal(700),
      z.enum(["normal", "bold"]),
    ])
    .optional(),
  lineHeight: LengthValue.optional(),
  letterSpacing: LengthValue.optional(),
  textAlign: z.enum(["left", "center", "right", "justify"]).optional(),
  textTransform: z.enum(["none", "uppercase", "lowercase", "capitalize"]).optional(),
  color: ColorValue.optional(),
  backgroundColor: ColorValue.optional(),
  borderWidth: LengthValue.optional(),
  borderStyle: z.enum(["none", "solid", "dashed", "dotted"]).optional(),
  borderColor: ColorValue.optional(),
  borderRadius: LengthValue.optional(),
});

export type StyleProps = z.infer<typeof StyleProps>;
