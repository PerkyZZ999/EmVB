/**
 * Render one extension element node to a VNode (W-927, D-066).
 * Missing extension, throwing render, or illegal output → placeholder.
 */

import type { LayoutNode } from "../schema/layout.ts";
import type { VNode } from "../render/vnode.ts";
import { extensionClassAllowlist, liveElement, liveExtension } from "./registry.ts";
import { validateExtensionProps } from "./schema.ts";
import { safeExtensionOutput } from "./safe-nodes.ts";
import { extensionPlaceholderVNode } from "./placeholder.ts";
import type { ExtensionRenderContext } from "./types.ts";
import { parseExtensionType } from "./namespace.ts";

export type ExtensionRenderMode = "public" | "editor";

function isThenable(value: unknown): value is Promise<unknown> {
  return !!value && typeof (value as { then?: unknown }).then === "function";
}

function cleanSourceRecord(raw: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  let n = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (n >= 32) break;
    if (typeof key !== "string" || !/^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/.test(key)) continue;
    if (typeof value !== "string") continue;
    let cleaned = "";
    for (const char of value) {
      const code = char.codePointAt(0) ?? 0;
      if (code === 9) cleaned += " ";
      else if (code === 10 || (code >= 32 && code !== 127 && !(code >= 0x80 && code <= 0x9f))) {
        cleaned += char;
      }
      if (cleaned.length >= 2000) break;
    }
    out[key] = cleaned.trim();
    n += 1;
  }
  return out;
}

/**
 * Resolve source values for one package (sync resolvers only).
 * Async sources are left empty here; hosts that need them can pre-resolve later.
 */
export function syncSourceValues(pkg: string): Record<string, Record<string, string>> {
  const ext = liveExtension(pkg);
  if (!ext?.sources) return {};
  const out: Record<string, Record<string, string>> = {};
  for (const source of ext.sources) {
    try {
      const result = source.resolve();
      if (result && typeof result === "object" && !Array.isArray(result) && !isThenable(result)) {
        out[source.name] = cleanSourceRecord(result as Readonly<Record<string, string>>);
      } else {
        out[source.name] = {};
      }
    } catch {
      out[source.name] = {};
    }
  }
  return out;
}

export type VisitChildren = (nodes: LayoutNode[]) => VNode[];

const propsOf = (node: { props?: unknown }): Record<string, unknown> =>
  node.props && typeof node.props === "object" && !Array.isArray(node.props)
    ? (node.props as Record<string, unknown>)
    : {};

/** Stable JSON: object keys sorted, so equal props give equal keys. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * W-1086: the key of one extension element's output: its type and props. The admin has no
 * extension code, so the editor canvas and the HTML export ask the server for outputs by key.
 */
export function extensionOutputKey(node: { type: string; props?: unknown }): string {
  return `${node.type}\n${stableJson(propsOf(node))}`;
}

/** Raw render output per `extensionOutputKey`, rendered by the server for the admin. */
export type ExtensionOutputs = ReadonlyMap<string, unknown>;

/**
 * Run the live render() of a stored extension element and check its output. Undefined when the
 * extension is missing here, render throws, or nothing legal is left.
 */
export function liveExtensionOutput(node: {
  type: string;
  props?: unknown;
}): LayoutNode[] | undefined {
  const parsed = parseExtensionType(node.type);
  const found = parsed ? liveElement(node.type) : undefined;
  if (!parsed || !found) return undefined;
  const checked = validateExtensionProps(found.manifest.schema, propsOf(node));
  const ctx: ExtensionRenderContext = { sources: syncSourceValues(parsed.pkg) };
  let raw: unknown;
  try {
    raw = found.element.render(checked.props, ctx);
  } catch {
    return undefined;
  }
  const safe = safeExtensionOutput(raw, Math.random, extensionClassAllowlist(parsed.pkg));
  return safe.length > 0 ? safe : undefined;
}

/**
 * Build the VNode for a stored extension element. Always returns a node (placeholder
 * on failure) so siblings keep rendering.
 */
export function renderExtensionNode(
  node: LayoutNode,
  mode: ExtensionRenderMode,
  visitChildren: VisitChildren,
  /** W-1086: server-rendered outputs (the admin's canvas and export), by `extensionOutputKey`. */
  outputs?: ExtensionOutputs,
  /** W-1086: told the package id whenever one of its elements renders. */
  rendered?: (pkg: string) => void,
): VNode {
  const id = typeof node.id === "string" ? node.id : undefined;
  const type = node.type;
  const parsed = parseExtensionType(type);
  if (!parsed) {
    return extensionPlaceholderVNode(type, id, mode);
  }

  let safe = liveExtensionOutput(node);
  if (!safe && !liveElement(type) && outputs?.has(extensionOutputKey(node))) {
    // The server's output is checked again here, with the allowlist the admin was sent.
    safe = safeExtensionOutput(
      outputs.get(extensionOutputKey(node)),
      Math.random,
      extensionClassAllowlist(parsed.pkg),
    );
  }
  if (!safe || safe.length === 0) {
    return extensionPlaceholderVNode(type, id, mode);
  }
  rendered?.(parsed.pkg);

  const children = visitChildren(safe);
  return {
    tag: "div",
    attrs: {
      class: "emvb-ext",
      "data-emvb-ext": type,
      ...(id && mode === "editor" ? { "data-emvb-id": id } : {}),
    },
    children,
  };
}
