import type { StyleProps } from "../../../../core/index.ts";
import { STYLE_UI } from "./style-sections.ts";
import { NEW_GRADIENT } from "./BackgroundControls.tsx";

export type FillMode = "color" | "gradient" | "image" | "video";

const BOXES = new Set([
  "container",
  "flexbox",
  "grid",
  "div-block",
  "layout-section",
  "form",
  "section",
  "tab-panel",
  "accordion",
  "accordion-item",
]);

/** Color and gradient everywhere. Image and video on boxes, or when already set. */
export function fillModes(type: string, style?: StyleProps): FillMode[] {
  const modes: FillMode[] = ["color", "gradient"];
  const box = BOXES.has(type) || !(type in STYLE_UI);
  if (box || type === "button" || type === "submit" || style?.backgroundImage !== undefined)
    modes.push("image");
  if (box || style?.backgroundVideo !== undefined) modes.push("video");
  return modes;
}

/** The fill the page is showing. Video wins, then image, then gradient, then a solid color. */
export function activeFill(style: StyleProps | undefined): FillMode {
  if (style?.backgroundVideo) return "video";
  if (style?.backgroundImage) return "image";
  if (style?.gradient) return "gradient";
  return "color";
}

/** More than one fill is stored, so the page paints a stack the type switcher will collapse. */
export function fillIsMixed(style: StyleProps | undefined): boolean {
  return (
    [
      style?.backgroundColor !== undefined,
      style?.gradient !== undefined,
      style?.backgroundImage !== undefined,
      style?.backgroundVideo !== undefined,
    ].filter(Boolean).length > 1
  );
}

const CLEARED = {
  backgroundColor: undefined,
  backgroundImage: undefined,
  backgroundSize: undefined,
  backgroundPosition: undefined,
  backgroundRepeat: undefined,
  gradient: undefined,
  overlay: undefined,
  backgroundVideo: undefined,
} as const;

/** Choosing a type removes the other fills. Overlay stays with an image or a video. */
function switchFill(style: StyleProps | undefined, mode: FillMode): Partial<StyleProps> {
  if (mode === "gradient") return { ...CLEARED, gradient: style?.gradient ?? NEW_GRADIENT };
  if (mode === "image") {
    return {
      ...CLEARED,
      backgroundImage: style?.backgroundImage,
      backgroundSize: style?.backgroundSize,
      backgroundPosition: style?.backgroundPosition,
      backgroundRepeat: style?.backgroundRepeat,
      overlay: style?.overlay,
    };
  }
  if (mode === "video") {
    return { ...CLEARED, backgroundVideo: style?.backgroundVideo, overlay: style?.overlay };
  }
  return { ...CLEARED, backgroundColor: style?.backgroundColor };
}

/** The fields a fill type owns as stored now, or undefined when that type has nothing set. */
function heldFill(style: StyleProps | undefined, mode: FillMode): Partial<StyleProps> | undefined {
  const main = {
    color: style?.backgroundColor,
    gradient: style?.gradient,
    image: style?.backgroundImage,
    video: style?.backgroundVideo,
  }[mode];
  if (main === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(switchFill(style, mode)).filter(([, value]) => value !== undefined),
  ) as Partial<StyleProps>;
}

/** What each fill type last held while this element was being edited (W-184). */
export type FillMemory = Partial<Record<FillMode, Partial<StyleProps>>>;

/**
 * Like `switchFill`, but the type being left is remembered in `memory`, and an empty type being
 * chosen gets back what it last held, so Gradient → Color → Gradient keeps the gradient (W-184).
 */
export function switchFillRemembered(
  style: StyleProps | undefined,
  from: FillMode,
  to: FillMode,
  memory: FillMemory,
): Partial<StyleProps> {
  const held = heldFill(style, from);
  if (held) memory[from] = held;
  const remembered = memory[to];
  if (remembered && heldFill(style, to) === undefined) return { ...CLEARED, ...remembered };
  return switchFill(style, to);
}
