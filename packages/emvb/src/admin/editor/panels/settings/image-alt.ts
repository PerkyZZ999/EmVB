import type { LayoutNode } from "../../../../core/index.ts";

/** Alt text that names the file or the element rather than the picture (W-265). */
const PLACEHOLDER = /^(image|picture|photo|img)$/i;
const FILE_NAME =
  /\.(jpe?g|png|gif|webp|avif|svg|bmp|tiff?)$|^(img|dsc|dscn|pxl|image|photo|screenshot|screen shot)[\s_-]*\d/i;

/**
 * W-265: a note for an Image whose alt won't help a screen reader user: none on a non-decorative
 * image (it then reads as decorative), the "Image" placeholder, or a camera or file name. Undefined
 * when the alt looks fine, the image is decorative or has no picture yet.
 */
export function imageAltNote(node: LayoutNode): string | undefined {
  if (node.type !== "image") return undefined;
  const props = node.props as { src?: string; alt?: string; decorative?: boolean };
  if (props.decorative === true || !props.src?.trim()) return undefined;
  const alt = (props.alt ?? "").trim();
  if (!alt) {
    return "This image has no alt text, so screen readers skip it. Describe it, or turn on Decorative if it only decorates.";
  }
  if (PLACEHOLDER.test(alt) || FILE_NAME.test(alt)) {
    return `“${alt}” doesn't say what the image shows. Describe it for people who can't see it.`;
  }
  return undefined;
}
