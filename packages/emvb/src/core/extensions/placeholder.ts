/**
 * Placeholder for a missing, throwing or illegal extension element (W-927, D-066).
 * Visible in the editor and on the published page; never runs extension code;
 * never breaks siblings.
 */

import type { VNode } from "../render/vnode.ts";
import { parseExtensionType } from "./namespace.ts";

/** Public copy shown when an extension element cannot render. */
export const EXTENSION_PLACEHOLDER_TEXT = "This block needs an extension that is not installed.";

/** Editor copy names the missing type so authors can tell which package to add back. */
export function extensionPlaceholderLabel(type: string): string {
  const safe = parseExtensionType(type) ? type : "extension";
  return `Missing extension “${safe}”`;
}

export function extensionPlaceholderVNode(
  type: string,
  id: string | undefined,
  mode: "public" | "editor",
): VNode {
  const label = mode === "editor" ? extensionPlaceholderLabel(type) : EXTENSION_PLACEHOLDER_TEXT;
  const safeType = parseExtensionType(type) ? type : undefined;
  return {
    tag: "div",
    attrs: {
      class: "emvb-ext-missing",
      ...(safeType ? { "data-emvb-ext": safeType } : {}),
      ...(id ? { "data-emvb-id": id } : {}),
      ...(mode === "public" ? { role: "note" } : {}),
    },
    children: [label],
  };
}

/** Minimal CSS so the placeholder is readable without any extension stylesheet. */
export const EXTENSION_PLACEHOLDER_CSS =
  ".emvb-ext-missing{margin:0;padding:12px 16px;border:1px dashed currentColor;opacity:0.7;font:inherit}" +
  ".emvb-ext{min-width:0}";
