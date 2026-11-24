/**
 * W-1086: class allowlists and build-time assets an extension declares, checked at registration.
 * Pure (no file access): the integration reads the files, this checks what it read.
 */

import type { ExtensionAssets, ExtensionClasses } from "./types.ts";

/** A prefix: lowercase words joined by hyphens, ending in `-` (`d-`, `acme-ui-`). */
const PREFIX = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-$/;
/**
 * A class name (extensionApi 1.5): matched exactly against the static allowlist, nothing parsed. The
 * characters are the ones compiled kits use: lowercase letters, digits, `-`, and `: / ! . _`, starting
 * with a letter or digit. No square brackets, spaces, quotes or markup. Whether a name means anything
 * comes from the kit's own CSS.
 */
const CLASS_NAME = /^[a-z0-9][a-z0-9:/!._-]*$/;

const MAX_CLASS_PREFIX_LENGTH = 16;
const MAX_CLASS_NAME_LENGTH = 64;
const MAX_ALLOWED_CLASSES = 512;
/** Extension classes kept on one output node; the rest are dropped. */
export const MAX_CLASSES_PER_NODE = 16;
export const MAX_EXTENSION_CSS_BYTES = 256 * 1024;
export const MAX_EXTENSION_RUNTIME_BYTES = 64 * 1024;

/** Why a class prefix is refused, or undefined when it is fine. */
export function classPrefixIssue(prefix: unknown): string | undefined {
  if (typeof prefix !== "string") return "the class prefix must be a string";
  if (prefix.length < 2 || prefix.length > MAX_CLASS_PREFIX_LENGTH) {
    return `the class prefix must be 2 to ${MAX_CLASS_PREFIX_LENGTH} characters`;
  }
  if (!PREFIX.test(prefix)) {
    return "the class prefix must be lowercase letters, digits and hyphens, ending in -";
  }
  if (prefix.startsWith("emvb")) return "the class prefix may not start with emvb";
  return undefined;
}

/** Whether `name` is a class an extension with this prefix may declare. */
function allowedClassName(name: unknown, prefix: string): name is string {
  return (
    typeof name === "string" &&
    name.length > prefix.length &&
    name.length <= MAX_CLASS_NAME_LENGTH &&
    CLASS_NAME.test(name) &&
    name.startsWith(prefix) &&
    !name.startsWith("emvb")
  );
}

/**
 * The checked allowlist: undefined when the prefix is refused or no name survives. Names that
 * break the pattern or miss the prefix are dropped one by one; at most MAX_ALLOWED_CLASSES stay.
 */
export function normalizeClasses(input: unknown): ExtensionClasses | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const { prefix, allow } = input as { prefix?: unknown; allow?: unknown };
  if (classPrefixIssue(prefix) || typeof prefix !== "string") return undefined;
  if (!Array.isArray(allow)) return undefined;
  const kept = new Set<string>();
  for (const name of allow) {
    if (kept.size >= MAX_ALLOWED_CLASSES) break;
    if (allowedClassName(name, prefix)) kept.add(name);
  }
  if (kept.size === 0) return undefined;
  return { prefix, allow: [...kept] };
}

/**
 * The extension classes an output node keeps: strings on the allowlist only, deduplicated, at
 * most MAX_CLASSES_PER_NODE. Anything else (free text, spaces, quotes, markup, emvb names) drops.
 */
export function filterExtensionClasses(
  raw: unknown,
  allow: ReadonlySet<string> | undefined,
): string[] {
  if (!allow || allow.size === 0 || !Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const name of raw) {
    if (out.length >= MAX_CLASSES_PER_NODE) break;
    if (typeof name === "string" && allow.has(name) && !out.includes(name)) out.push(name);
  }
  return out;
}

const byteLength = (text: string) => new TextEncoder().encode(text).length;

/** Why stylesheet text is refused: too large, or it could close the `<style>` it is written in. */
export function extensionCssIssue(css: string): string | undefined {
  if (byteLength(css) > MAX_EXTENSION_CSS_BYTES) {
    return `the stylesheet is larger than ${MAX_EXTENSION_CSS_BYTES / 1024} KB`;
  }
  if (/<\/style/i.test(css)) return "the stylesheet contains </style";
  return undefined;
}

/** Why runtime text is refused: too large, a module, or it could break out of its `<script>`. */
export function extensionRuntimeIssue(code: string): string | undefined {
  if (byteLength(code) > MAX_EXTENSION_RUNTIME_BYTES) {
    return `the runtime is larger than ${MAX_EXTENSION_RUNTIME_BYTES / 1024} KB`;
  }
  if (/<\/script|<script|<!--/i.test(code)) return "the runtime contains <script, </script or <!--";
  if (/^\s*(?:import\s*[{*"'(]|import\s+[\w$]|export\s)/m.test(code)) {
    return "the runtime must be a self-contained script without import or export";
  }
  return undefined;
}

/** Assets that pass the checks above; anything else is dropped. Undefined when none is left. */
export function cleanExtensionAssets(input: unknown): ExtensionAssets | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const { css, runtime } = input as { css?: unknown; runtime?: unknown };
  const out: ExtensionAssets = {};
  if (typeof css === "string" && css.trim() && !extensionCssIssue(css)) out.css = css;
  if (typeof runtime === "string" && runtime.trim() && !extensionRuntimeIssue(runtime)) {
    out.runtime = runtime;
  }
  return out.css !== undefined || out.runtime !== undefined ? out : undefined;
}
