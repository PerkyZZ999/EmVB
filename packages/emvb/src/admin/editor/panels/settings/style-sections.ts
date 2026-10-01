import type { StyleProps } from "../../../../core/index.ts";

export type StyleSectionId =
  | "layout"
  | "spacing"
  | "size"
  | "position"
  | "typography"
  | "background"
  | "border"
  | "effects"
  | "advanced";

export type StyleKey = keyof StyleProps;

/** Elementor v4 order (W-088); every list below follows it. */
const SECTION_ORDER: StyleSectionId[] = [
  "layout",
  "spacing",
  "size",
  "position",
  "typography",
  "background",
  "border",
  "effects",
  "advanced",
];

const TEXT_SECTIONS: StyleSectionId[] = [
  "spacing",
  "size",
  "position",
  "typography",
  "background",
  "border",
  "effects",
  "advanced",
];

/** Which Style sections appear, and which opens by default (IA table). */
export const STYLE_UI: Record<string, { sections: StyleSectionId[]; defaultOpen: StyleSectionId }> =
  {
    container: {
      sections: [
        "layout",
        "spacing",
        "size",
        "position",
        "background",
        "border",
        "effects",
        "advanced",
      ],
      defaultOpen: "layout",
    },
    spacer: { sections: ["layout", "advanced"], defaultOpen: "layout" },
    divider: {
      sections: ["spacing", "size", "position", "border", "effects", "advanced"],
      defaultOpen: "border",
    },
    heading: { sections: TEXT_SECTIONS, defaultOpen: "typography" },
    text: { sections: TEXT_SECTIONS, defaultOpen: "typography" },
    label: { sections: TEXT_SECTIONS, defaultOpen: "typography" },
    link: { sections: TEXT_SECTIONS, defaultOpen: "typography" },
    list: { sections: TEXT_SECTIONS, defaultOpen: "typography" },
    button: { sections: TEXT_SECTIONS, defaultOpen: "background" },
    image: {
      sections: ["spacing", "size", "position", "border", "effects", "advanced"],
      defaultOpen: "size",
    },
    icon: {
      sections: ["spacing", "size", "position", "typography", "effects", "advanced"],
      defaultOpen: "typography",
    },
    video: {
      sections: ["spacing", "size", "position", "border", "effects", "advanced"],
      defaultOpen: "size",
    },
    form: {
      sections: [
        "layout",
        "spacing",
        "size",
        "position",
        "background",
        "border",
        "effects",
        "advanced",
      ],
      defaultOpen: "layout",
    },
    "text-input": { sections: TEXT_SECTIONS, defaultOpen: "typography" },
    textarea: { sections: TEXT_SECTIONS, defaultOpen: "typography" },
    select: { sections: TEXT_SECTIONS, defaultOpen: "typography" },
    checkbox: {
      sections: ["layout", "spacing", "size", "position", "typography", "effects", "advanced"],
      defaultOpen: "typography",
    },
    radio: {
      sections: ["layout", "spacing", "size", "position", "typography", "effects", "advanced"],
      defaultOpen: "typography",
    },
    submit: { sections: TEXT_SECTIONS, defaultOpen: "background" },
  };

/** Types without an entry (Flexbox, Div Block, SVG, Tabs, dynamic elements) show every section. */
export const DEFAULT_UI = {
  sections: SECTION_ORDER,
  defaultOpen: "layout" as StyleSectionId,
};

export const SECTION_LABELS: Record<StyleSectionId, string> = {
  layout: "Layout",
  spacing: "Spacing",
  size: "Size",
  position: "Position",
  typography: "Typography",
  background: "Background",
  border: "Border",
  effects: "Effects",
  advanced: "Advanced",
};

/** Style property keys shown in each section (subset of StyleProps). */
const SECTION_KEYS: Record<StyleSectionId, StyleKey[]> = {
  layout: ["flexDirection", "flexWrap", "justifyContent", "alignItems", "gap"],
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
  size: [
    "width",
    "height",
    "minWidth",
    "minHeight",
    "maxWidth",
    "maxHeight",
    "overflow",
    "aspectRatio",
    "objectFit",
  ],
  position: ["position", "top", "right", "bottom", "left", "zIndex"],
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
  background: [
    "backgroundColor",
    "backgroundImage",
    "backgroundSize",
    "backgroundPosition",
    "backgroundRepeat",
    "gradient",
    "overlay",
  ],
  border: ["borderWidth", "borderStyle", "borderColor", "borderRadius"],
  effects: ["opacity", "boxShadow", "filter", "cursor", "transition"],
  advanced: [],
};

/** Keys that only make sense on some element types. */
const ONLY_FOR: Partial<Record<StyleKey, string[]>> = {
  objectFit: ["image", "video"],
};

/** Per-type filters so Spacer and Divider don't get every control. */
const TYPE_SECTION_KEYS: Record<string, Partial<Record<StyleSectionId, StyleKey[]>>> = {
  spacer: { layout: [] }, // height is a content prop, shown above sections
  divider: { size: ["width"] },
};

const OFFSETS = new Set<StyleKey>(["top", "right", "bottom", "left"]);

/** Offsets only do anything once the element is positioned (W-088). */
export const offsetsApply = (position: StyleProps["position"]) =>
  position !== undefined && position !== "static";

/**
 * The keys a section shows for a type. Offsets need `position` (the value in effect) to be
 * other than static. With `style`, a key that is set there is always shown,
 * even where the type wouldn't offer it, so a stored value can be seen and reset (W-088).
 */
export function keysFor(
  type: string,
  section: StyleSectionId,
  style?: StyleProps,
  position?: StyleProps["position"],
): StyleKey[] {
  const offered = new Set(
    (
      TYPE_SECTION_KEYS[type]?.[section] ??
      SECTION_KEYS[section].filter((key) => ONLY_FOR[key]?.includes(type) ?? true)
    ).filter((key) => !OFFSETS.has(key) || offsetsApply(position)),
  );
  return SECTION_KEYS[section].filter((key) => offered.has(key) || style?.[key] !== undefined);
}

/** The type's sections, plus any other section holding a set value, in section order. */
export function sectionsFor(
  sections: StyleSectionId[],
  style: StyleProps | undefined,
): StyleSectionId[] {
  return SECTION_ORDER.filter(
    (id) => sections.includes(id) || SECTION_KEYS[id].some((key) => style?.[key] !== undefined),
  );
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
  maxHeight: "Max height",
  overflow: "Overflow",
  aspectRatio: "Aspect ratio",
  objectFit: "Object fit",
  paddingTop: "Padding top",
  paddingRight: "Padding right",
  paddingBottom: "Padding bottom",
  paddingLeft: "Padding left",
  marginTop: "Margin top",
  marginRight: "Margin right",
  marginBottom: "Margin bottom",
  marginLeft: "Margin left",
  position: "Position",
  top: "Top",
  right: "Right",
  bottom: "Bottom",
  left: "Left",
  zIndex: "Z-index",
  fontFamily: "Font family",
  fontSize: "Font size",
  fontWeight: "Weight",
  lineHeight: "Line height",
  letterSpacing: "Letter spacing",
  textAlign: "Align text",
  textTransform: "Transform",
  color: "Color",
  backgroundColor: "Background",
  backgroundImage: "Image",
  backgroundSize: "Image size",
  backgroundPosition: "Image position",
  backgroundRepeat: "Repeat",
  gradient: "Gradient",
  overlay: "Overlay",
  borderWidth: "Border width",
  borderStyle: "Border style",
  borderColor: "Border color",
  borderRadius: "Radius",
  opacity: "Opacity",
  boxShadow: "Box shadow",
  filter: "Filters",
  cursor: "Cursor",
  transition: "Transition",
};

/** Every StyleProps key that the settings panel must be able to edit. */
export const CONTROLLED_STYLE_KEYS: StyleKey[] = Object.values(SECTION_KEYS).flat();
