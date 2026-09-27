import type { StyleProps } from "../../../../core/index.ts";

export type StyleSectionId =
  | "layout"
  | "spacing"
  | "typography"
  | "background"
  | "border"
  | "advanced";

export type StyleKey = keyof StyleProps;

/** Which Style sections appear, and which opens by default (IA table). */
export const STYLE_UI: Record<string, { sections: StyleSectionId[]; defaultOpen: StyleSectionId }> =
  {
    container: {
      sections: ["layout", "spacing", "background", "border", "advanced"],
      defaultOpen: "layout",
    },
    spacer: { sections: ["layout", "advanced"], defaultOpen: "layout" },
    divider: {
      sections: ["layout", "spacing", "border", "advanced"],
      defaultOpen: "border",
    },
    heading: {
      sections: ["layout", "spacing", "typography", "background", "border", "advanced"],
      defaultOpen: "typography",
    },
    text: {
      sections: ["layout", "spacing", "typography", "background", "border", "advanced"],
      defaultOpen: "typography",
    },
    label: {
      sections: ["layout", "spacing", "typography", "background", "border", "advanced"],
      defaultOpen: "typography",
    },
    link: {
      sections: ["layout", "spacing", "typography", "background", "border", "advanced"],
      defaultOpen: "typography",
    },
    list: {
      sections: ["layout", "spacing", "typography", "background", "border", "advanced"],
      defaultOpen: "typography",
    },
    button: {
      sections: ["layout", "spacing", "typography", "background", "border", "advanced"],
      defaultOpen: "background",
    },
    image: {
      sections: ["layout", "spacing", "border", "advanced"],
      defaultOpen: "layout",
    },
    icon: {
      sections: ["layout", "spacing", "typography", "advanced"],
      defaultOpen: "typography",
    },
    video: {
      sections: ["layout", "spacing", "border", "advanced"],
      defaultOpen: "layout",
    },
    form: {
      sections: ["layout", "spacing", "background", "border", "advanced"],
      defaultOpen: "layout",
    },
    "text-input": {
      sections: ["layout", "spacing", "typography", "background", "border", "advanced"],
      defaultOpen: "typography",
    },
    textarea: {
      sections: ["layout", "spacing", "typography", "background", "border", "advanced"],
      defaultOpen: "typography",
    },
    select: {
      sections: ["layout", "spacing", "typography", "background", "border", "advanced"],
      defaultOpen: "typography",
    },
    checkbox: {
      sections: ["layout", "spacing", "typography", "advanced"],
      defaultOpen: "typography",
    },
    radio: {
      sections: ["layout", "spacing", "typography", "advanced"],
      defaultOpen: "typography",
    },
    submit: {
      sections: ["layout", "spacing", "typography", "background", "border", "advanced"],
      defaultOpen: "background",
    },
  };

export const SECTION_LABELS: Record<StyleSectionId, string> = {
  layout: "Layout",
  spacing: "Spacing",
  typography: "Typography",
  background: "Background",
  border: "Border",
  advanced: "Advanced",
};

/** Style property keys shown in each section (subset of StyleProps). */
const SECTION_KEYS: Record<StyleSectionId, StyleKey[]> = {
  layout: [
    "flexDirection",
    "flexWrap",
    "justifyContent",
    "alignItems",
    "gap",
    "width",
    "minWidth",
    "maxWidth",
    "height",
    "minHeight",
  ],
  spacing: [
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
  ],
  typography: [
    "fontFamily",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "letterSpacing",
    "textAlign",
    "textTransform",
    "color",
  ],
  background: ["backgroundColor"],
  border: ["borderWidth", "borderStyle", "borderColor", "borderRadius"],
  advanced: [],
};

/** Per-type filters so Spacer/Divider don't get every flex control. */
const TYPE_SECTION_KEYS: Record<string, Partial<Record<StyleSectionId, StyleKey[]>>> = {
  spacer: { layout: [] }, // height is a content prop, shown above sections
  divider: { layout: ["width"] },
  heading: {
    layout: ["width", "minWidth", "maxWidth", "height", "minHeight"],
  },
  text: { layout: ["width", "minWidth", "maxWidth", "height", "minHeight"] },
  label: { layout: ["width", "minWidth", "maxWidth", "height", "minHeight"] },
  link: { layout: ["width", "minWidth", "maxWidth", "height", "minHeight"] },
  list: { layout: ["width", "minWidth", "maxWidth", "height", "minHeight"] },
  button: { layout: ["width", "minWidth", "maxWidth", "height", "minHeight"] },
};

export function keysFor(type: string, section: StyleSectionId): StyleKey[] {
  const override = TYPE_SECTION_KEYS[type]?.[section];
  if (override) return override;
  return SECTION_KEYS[section];
}

export const STYLE_LABELS: Record<StyleKey, string> = {
  flexDirection: "Direction",
  flexWrap: "Wrap",
  justifyContent: "Justify",
  alignItems: "Align",
  gap: "Gap",
  width: "Width",
  minWidth: "Min width",
  maxWidth: "Max width",
  height: "Height",
  minHeight: "Min height",
  paddingTop: "Padding top",
  paddingRight: "Padding right",
  paddingBottom: "Padding bottom",
  paddingLeft: "Padding left",
  marginTop: "Margin top",
  marginRight: "Margin right",
  marginBottom: "Margin bottom",
  marginLeft: "Margin left",
  fontFamily: "Font family",
  fontSize: "Font size",
  fontWeight: "Weight",
  lineHeight: "Line height",
  letterSpacing: "Letter spacing",
  textAlign: "Align text",
  textTransform: "Transform",
  color: "Color",
  backgroundColor: "Background",
  borderWidth: "Border width",
  borderStyle: "Border style",
  borderColor: "Border color",
  borderRadius: "Radius",
};

/** Every StyleProps key that the settings panel must be able to edit. */
export const CONTROLLED_STYLE_KEYS: StyleKey[] = [
  ...new Set(
    Object.values(SECTION_KEYS)
      .flat()
      .concat(...Object.values(TYPE_SECTION_KEYS).flatMap((m) => Object.values(m).flat())),
  ),
];
