/**
 * W-1086: class allowlists and build-time assets an extension declares, checked at registration.
 * Pure (no file access): the integration reads the files, this checks what it read.
 */

import { HEX_COLOR, LENGTH_UNITS } from "../css-keywords.ts";
import { isSafeCssValue } from "../sanitize/css.ts";
import type { ExtensionAssets, ExtensionClasses } from "./types.ts";

/** A prefix: lowercase words joined by hyphens, ending in `-` (`d-`, `acme-ui-`). */
const PREFIX = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-$/;
/** A class name: a lowercase letter, then lowercase letters, digits and hyphens. */
const CLASS_NAME = /^[a-z][a-z0-9-]*$/;

/** A custom property name an extension may set: `--`, a lowercase letter, then letters, digits, hyphens. */
const VAR_NAME = /^--[a-z][a-z0-9-]*$/;
const MAX_VAR_NAME_LENGTH = 64;
const MAX_LISTED_VARS = 64;
/** `extVars` entries kept on one output node; the rest are dropped. */
const MAX_VARS_PER_NODE = 16;
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
 * The checked allowlist: undefined when the prefix is refused or no class name and no variable
 * survives. Names that break the pattern or miss the prefix are dropped one by one; at most
 * MAX_ALLOWED_CLASSES stay. A list of `vars` keeps the allowlist even when `allow` is empty.
 */
export function normalizeClasses(input: unknown): ExtensionClasses | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const { prefix, allow, vars } = input as { prefix?: unknown; allow?: unknown; vars?: unknown };
  if (classPrefixIssue(prefix) || typeof prefix !== "string") return undefined;
  if (!Array.isArray(allow)) return undefined;
  const kept = new Set<string>();
  for (const name of allow) {
    if (kept.size >= MAX_ALLOWED_CLASSES) break;
    if (allowedClassName(name, prefix)) kept.add(name);
  }
  const listed = listedVars(vars);
  // An extension that only sets variables lists them in `vars` and needs no class (`allow: []`).
  if (kept.size === 0 && listed.length === 0) return undefined;
  return { prefix, allow: [...kept], ...(listed.length > 0 ? { vars: listed } : {}) };
}

/** The names in `classes.vars` that are valid custom property names; the rest are dropped. */
function listedVars(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const kept = new Set<string>();
  for (const name of input) {
    if (kept.size >= MAX_LISTED_VARS) break;
    if (isVarName(name)) kept.add(name);
  }
  return [...kept];
}
function isVarName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.length <= MAX_VAR_NAME_LENGTH &&
    VAR_NAME.test(name) &&
    !name.startsWith("--emvb")
  );
}
const NUMBER = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)`;
const UNITS = LENGTH_UNITS.filter((unit) => unit !== "%").join("|");
/** One number, optionally with a percent sign, an angle unit or `none`: a colour function argument. */
const COLOR_ARG = String.raw`(?:${NUMBER}(?:%|deg|grad|rad|turn)?|none)`;
const VALUE_FORMS: readonly RegExp[] = [
  new RegExp(`^${NUMBER}$`), // number: 70, -1.5, .5
  new RegExp(`^${NUMBER}(?:${UNITS})$`, "i"), // length: 12px, 1.5rem, 50vw
  new RegExp(`^${NUMBER}%$`), // percentage: 50%
  new RegExp(`^${NUMBER}(?:deg|grad|rad|turn)$`, "i"), // angle: 90deg, .25turn
  HEX_COLOR, // colour: #fff, #1a2b3c, #1a2b3c80
  /^(?:transparent|currentcolor)$/i, // colour keywords
  // colour functions, as kits compile them: rgb(0 0 0 / 50%), oklch(70% 0.2 150)
  new RegExp(
    String.raw`^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*${COLOR_ARG}(?:\s*,\s*|\s+)${COLOR_ARG}(?:\s*,\s*|\s+)${COLOR_ARG}(?:\s*[,/]\s*${COLOR_ARG})?\s*\)$`,
    "i",
  ),
];
/**
 * Whether `value` is a form `extVars` takes: one number, length, percentage, angle or colour. A
 * list of tokens (`a b`, `70px 2`), a keyword such as `red`, `var()` and `calc()` are not. It is
 * checked after `isSafeCssValue`, which keeps braces, quotes, `url(` and comments out.
 */
export function isExtensionVarValue(value: unknown): value is string {
  return (
    typeof value === "string" &&
    isSafeCssValue(value) &&
    VALUE_FORMS.some((form) => form.test(value))
  );
}
/** What an extension's `extVars` may set: names under its prefix, plus the names it lists. */
export type ExtensionVarRule = { prefix: string; vars: ReadonlySet<string> };
/**
 * The custom properties an output node keeps: a name that starts with `--` and the prefix (and has
 * more after it) or is listed, with a value that is one number, length, percentage, angle or colour
 * (`isExtensionVarValue`). At most MAX_VARS_PER_NODE stay. Without a rule (no class prefix
 * declared) everything drops.
 */
export function filterExtensionVars(
  raw: unknown,
  rule: ExtensionVarRule | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!rule || !raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  let kept = 0;
  for (const [name, value] of Object.entries(raw)) {
    if (kept >= MAX_VARS_PER_NODE) break;
    const own = name.startsWith(`--${rule.prefix}`) && name.length > rule.prefix.length + 2;
    if (!isVarName(name) || !(own || rule.vars.has(name))) continue;
    if (!isExtensionVarValue(value)) continue;
    out[name] = value;
    kept += 1;
  }
  return out;
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
