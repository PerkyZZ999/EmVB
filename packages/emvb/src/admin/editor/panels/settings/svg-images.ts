import { sanitizeSvgReport, type LayoutNode } from "../../../../core/index.ts";

/** W-231: how many external `<image>`s an SVG element's markup loses when it renders. */
export function svgImagesLeftOut(node: LayoutNode): number {
  if (node.type !== "svg") return 0;
  const markup = (node.props as { markup?: unknown }).markup;
  return typeof markup === "string" ? sanitizeSvgReport(markup).images : 0;
}

/** The note under the SVG markup field when some of its images are left out. */
export function svgImagesNotice(count: number): string {
  const what = count === 1 ? "1 external image" : `${count} external images`;
  return `Left out ${what}. An SVG can only show pictures from the media library or embedded PNG, JPEG, WebP or GIF data.`;
}

/**
 * W-787: refused markup (a script, an event handler, a style, a link, an outside URL, or just
 * cut off mid-paste) rendered as an empty grey box with no word of why. The note under the field.
 */
export function svgMarkupRefused(node: LayoutNode): string | undefined {
  if (node.type !== "svg") return undefined;
  const markup = (node.props as { markup?: unknown }).markup;
  if (typeof markup !== "string") return undefined;
  if (markup.trim() === "") return "Paste SVG markup to show a graphic here.";
  if (sanitizeSvgReport(markup).tree) return undefined;
  return "This SVG can't be shown, so visitors see an empty box. Check that it is complete and has no scripts, event handlers (onload…), styles, links or outside URLs.";
}
