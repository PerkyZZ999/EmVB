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
function containsInteractive(node: LayoutNode): boolean {
  if (node.type === "link" || node.type === "post-link" || node.type === "button") return true;
  if (BOX.has(node.type) || node.type === "heading" || node.type === "icon") {
    const href = (node.props as { href?: unknown }).href;
    if (typeof href === "string" && href.trim()) return true;
  }
  return childrenOf(node).some(containsInteractive);
}

/**
 * A div box becomes the link. A landmark tag stays a landmark. A link already inside the box
 * keeps the box from becoming a link, so the page never nests anchors.
 */
export function applyBoxLink(node: LayoutNode, vnode: VNode): VNode {
  if (!BOX.has(node.type) || vnode.tag !== "div") return vnode;
  const { href, newTab } = node.props as { href?: string; newTab?: boolean };
  if (!href?.trim()) return vnode;
  if (childrenOf(node).some(containsInteractive)) return vnode;
  const safe = sanitizeHref(href);
  if (!safe) return vnode;
  const attrs: Record<string, string> = { ...vnode.attrs, href: safe };
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
        attrs: { class: "emvb-bg-video", src, muted: "", loop: "", playsinline: "", autoplay: "" },
        children: [],
      },
      ...vnode.children,
    ],
  };
}
