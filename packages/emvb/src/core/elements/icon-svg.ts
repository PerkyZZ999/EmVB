/**
 * The SVG of an icon (W-025, W-234, W-237, W-238): a bundled Lucide icon or a picked one, sized,
 * its stroke width themable and, when asked, painted in one colour. The Icon element and the
 * 1.2 widgets that show an icon (W-1020) draw it here.
 */
import { getBundledIcon } from "../icons/catalog.ts";
import type { VNode } from "../render/vnode.ts";
import { sanitizeSvgMarkup } from "../sanitize/svg.ts";

/** Root stroke widths the Stroke width control can override (W-237); Lucide and Tabler use 2. */
export const ICON_STROKE_WIDTHS = ["1", "1.5", "2", "2.5", "3"] as const;

/**
 * W-237: a stroke icon's root `stroke-width` moves into a class whose CSS reads the wrapper's
 * `--emvb-icon-stroke` with the original width as fallback; any other width stays as it was.
 */
export function strokeClass(svgAttrs: Record<string, string>): void {
  const width = svgAttrs["stroke-width"];
  if (!width || !(ICON_STROKE_WIDTHS as readonly string[]).includes(width)) return;
  if (!svgAttrs.stroke || svgAttrs.stroke === "none") return;
  delete svgAttrs["stroke-width"];
  const cls = `emvb-icon-sw${width.replace(".", "_")}`;
  svgAttrs.class = svgAttrs.class ? `${svgAttrs.class} ${cls}` : cls;
}

/** Whether an icon's SVG is stroke-drawn with an adjustable width (the panel shows the control). */
export function iconHasAdjustableStroke(svg: string | undefined): boolean {
  if (!svg) return true; // bundled Lucide
  const picked = sanitizeSvgMarkup(svg);
  if (!picked) return false;
  const attrs = pickedIconAttrs(picked.attrs);
  const before = attrs["stroke-width"];
  strokeClass(attrs);
  return before !== undefined && attrs["stroke-width"] === undefined;
}

/** Paint attributes a multi-colour SVG sets its colours with (W-238). */
const PAINT_ATTRS = ["fill", "stroke", "stop-color"] as const;

const ownColor = (value: string | undefined) =>
  value !== undefined && value !== "none" && value.toLowerCase() !== "currentcolor";

/** W-238: every fill, stroke and gradient stop becomes the icon's colour; `none` stays none. */
export function monochrome(nodes: (VNode | string)[]): (VNode | string)[] {
  return nodes.map((child) => {
    if (typeof child === "string") return child;
    const attrs = { ...child.attrs };
    for (const name of PAINT_ATTRS) if (ownColor(attrs[name])) attrs[name] = "currentColor";
    return { ...child, attrs, children: monochrome(child.children) };
  });
}

/** The root too; without a fill, SVG paints black, so it gets the icon's colour. */
export function monochromeRoot(attrs: Record<string, string>): void {
  if (attrs.fill === undefined || ownColor(attrs.fill)) attrs.fill = "currentColor";
  if (ownColor(attrs.stroke)) attrs.stroke = "currentColor";
}

/**
 * Whether an icon's SVG paints with its own colours (W-238): any fill, stroke or stop other than
 * `none`/`currentColor`, or a root without a fill (SVG's default is black). The panel offers
 * Force single colour only then. Bundled Lucide icons follow the icon's colour already.
 */
export function iconHasOwnColors(svg: string | undefined): boolean {
  if (!svg) return false;
  const picked = sanitizeSvgMarkup(svg);
  if (!picked) return false;
  if (picked.attrs.fill === undefined || PAINT_ATTRS.some((name) => ownColor(picked.attrs[name])))
    return true;
  const walk = (nodes: (VNode | string)[]): boolean =>
    nodes.some(
      (child) =>
        typeof child !== "string" &&
        (PAINT_ATTRS.some((name) => ownColor(child.attrs[name])) || walk(child.children)),
    );
  return walk(picked.children);
}

/** A picked icon's root attributes minus what the element sets itself (size, name, id). */
export function pickedIconAttrs(attrs: Record<string, string>): Record<string, string> {
  const kept: Record<string, string> = { xmlns: "http://www.w3.org/2000/svg" };
  for (const [name, value] of Object.entries(attrs)) {
    if (name === "width" || name === "height" || name === "id" || name === "role") continue;
    if (name.startsWith("aria-") || name === "focusable") continue;
    kept[name] = value;
  }
  if (!kept.viewBox) kept.viewBox = "0 0 24 24";
  return kept;
}

/**
 * W-1020: an icon's `<svg>` at `size` px with `aria` (its name, or `aria-hidden`), or undefined
 * when the id is unknown and no SVG is stored.
 */
export function iconGlyph(
  props: { iconId: string; iconSvg?: string | undefined; singleColor?: boolean | undefined },
  size: number,
  aria: Record<string, string>,
): VNode | undefined {
  // W-234: a picked library icon carries its own SVG; the allowlist checks it on every render.
  const picked = props.iconSvg ? sanitizeSvgMarkup(props.iconSvg) : undefined;
  const bundled = picked ? undefined : getBundledIcon(props.iconId);
  if (!picked && !bundled) return undefined;
  const svgAttrs: Record<string, string> = picked
    ? {
        ...pickedIconAttrs(picked.attrs),
        width: String(size),
        height: String(size),
        focusable: "false",
      }
    : {
        xmlns: "http://www.w3.org/2000/svg",
        width: String(size),
        height: String(size),
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "2",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        focusable: "false",
      };
  Object.assign(svgAttrs, aria);
  const children: (VNode | string)[] = picked
    ? picked.children
    : (bundled?.children ?? []).map((child) => ({
        tag: child.tag,
        attrs: { ...child.attrs },
        children: [],
      }));
  strokeClass(svgAttrs);
  const single = picked !== undefined && props.singleColor === true;
  if (single) monochromeRoot(svgAttrs);
  return { tag: "svg", attrs: svgAttrs, children: single ? monochrome(children) : children };
}
