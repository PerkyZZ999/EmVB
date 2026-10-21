import type { LayoutNode } from "../schema/layout.ts";
import { sanitizeHref } from "../sanitize/href.ts";
import { sanitizeMediaUrl } from "../sanitize/media-url.ts";
import type { VNode } from "./vnode.ts";

const ATTR_NAME = /^(?:data|aria)-[a-z][a-z0-9-]{0,40}$/;
const BOX = new Set(["container", "div-block", "flexbox", "grid"]);

/**
 * Names the EmDash forms client reads (`[data-ec-form]`, `[data-page]`, `[data-error-for]`…). One of
 * them on an element would make the client treat it as a form, a form page or an error slot (W-191).
 */
const FORMS_RUNTIME_ATTRS = new Set([
  "data-condition",
  "data-error-for",
  "data-form-id",
  "data-form-status",
  "data-page",
  "data-sitekey",
  "data-submit-label",
  "data-was-required",
]);

/** Custom attribute names EmVB keeps for itself: the editor's and the forms client's. */
export const isReservedAttribute = (name: string): boolean =>
  name.startsWith("data-emvb") || name.startsWith("data-ec-") || FORMS_RUNTIME_ATTRS.has(name);

/** `data-*` and `aria-*` from Advanced, minus the reserved names (`isReservedAttribute`). */
export function customAttributes(node: LayoutNode): Record<string, string> {
  const list = node.attributes;
  if (!list) return {};
  const attrs: Record<string, string> = {};
  const seen = new Set<string>();
  for (const item of list) {
    if (!ATTR_NAME.test(item.name) || isReservedAttribute(item.name)) continue;
    if (seen.has(item.name) || item.value.length > 200) continue;
    if ([...item.value].some((char) => char.charCodeAt(0) < 32)) continue;
    seen.add(item.name);
    attrs[item.name] = item.value;
  }
  return attrs;
}

function childrenOf(node: LayoutNode): LayoutNode[] {
  return "children" in node && Array.isArray(node.children) ? node.children : [];
}

/** A link, a button, or a box that is already a link. */
/**
 * W-668: elements that always render a link, control or embed. A linked box around one of these
 * nested an <a> in an <a> (the browser then splits the box apart) or put a menu, form field,
 * accordion toggle or video player inside a link.
 */
const ALWAYS_INTERACTIVE = new Set([
  "link",
  "post-link",
  "button",
  "menu",
  "menu-item",
  "accordion",
  "accordion-item",
  "tabs",
  "video",
  "form",
  "text-input",
  "textarea",
  "select",
  "checkbox",
  "radio",
  "submit",
  "pagination",
  "toc",
  // Post content can hold links of its own.
  "post-content",
]);

function containsInteractive(node: LayoutNode): boolean {
  if (ALWAYS_INTERACTIVE.has(node.type)) return true;
  const props = node.props as { partId?: unknown; itemPartId?: unknown };
  // A synced section or Loop Item part is another layout this check can't see into.
  if (node.type === "section" && typeof props.partId === "string" && props.partId.trim())
    return true;
  if (node.type === "loop" && typeof props.itemPartId === "string" && props.itemPartId.trim()) {
    return true;
  }
  if (
    BOX.has(node.type) ||
    node.type === "heading" ||
    node.type === "icon" ||
    node.type === "image"
  ) {
    const href = (node.props as { href?: unknown }).href;
    if (typeof href === "string" && href.trim()) return true;
  }
  return childrenOf(node).some(containsInteractive);
}

/**
 * A div box becomes the link. A landmark tag stays a landmark. A link already inside the box
 * keeps the box from becoming a link, so the page never nests anchors.
 */
/**
 * W-669: a box with a working Link that still renders as a box because something inside it is a
 * link, control or embed. The editor says so; the Link otherwise did nothing without a word.
 */
export function boxLinkHeldBack(node: LayoutNode): boolean {
  if (!BOX.has(node.type)) return false;
  const href = (node.props as { href?: unknown }).href;
  if (typeof href !== "string" || !href.trim() || !sanitizeHref(href)) return false;
  return childrenOf(node).some(containsInteractive);
}

/** W-798: the same test applyBoxLink makes, for checks that see only the layout (the audit). */
export function boxBecomesLink(node: LayoutNode): boolean {
  if (!BOX.has(node.type)) return false;
  const { href, tag } = node.props as { href?: unknown; tag?: unknown };
  if (tag !== undefined && tag !== "div") return false;
  if (typeof href !== "string" || !href.trim() || !sanitizeHref(href)) return false;
  return !childrenOf(node).some(containsInteractive);
}

export function applyBoxLink(node: LayoutNode, vnode: VNode): VNode {
  if (!BOX.has(node.type) || vnode.tag !== "div") return vnode;
  const { href, newTab } = node.props as { href?: string; newTab?: boolean };
  if (!href?.trim()) return vnode;
  if (childrenOf(node).some(containsInteractive)) return vnode;
  const safe = sanitizeHref(href);
  if (!safe) return vnode;
  const attrs: Record<string, string> = {
    ...vnode.attrs,
    class: `${vnode.attrs.class ?? ""} emvb-box-link`.trim(),
    href: safe,
  };
  if (newTab) {
    attrs.target = "_blank";
    attrs.rel = "noopener noreferrer";
  }
  return { ...vnode, tag: "a", attrs };
}

export function safeBackgroundVideo(url: string | undefined): string | undefined {
  if (!url || /[()\\\s"'`]/.test(url)) return undefined;
  return sanitizeMediaUrl(url) === url ? url : undefined;
}

/** A muted, looping video behind the element's children. */
export function applyBackgroundVideo(vnode: VNode, src: string | undefined): VNode {
  if (!src) return vnode;
  const className = `${vnode.attrs.class ?? ""} emvb-has-bg-video`.trim();
  return {
    ...vnode,
    attrs: { ...vnode.attrs, class: className },
    children: [
      {
        tag: "video",
        // W-801: decoration, not content, so screen readers skip it.
        attrs: {
          class: "emvb-bg-video",
          src,
          muted: "",
          loop: "",
          playsinline: "",
          autoplay: "",
          "aria-hidden": "true",
        },
        children: [],
      },
      ...vnode.children,
    ],
  };
}
