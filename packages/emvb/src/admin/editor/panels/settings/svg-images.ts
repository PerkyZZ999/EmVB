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
