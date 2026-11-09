/**
 * Extension type namespacing (W-927, D-066). Stored types are `ext:<pkg>/<name>`.
 * Built-in element types, path escape, HTML and extra colons are refused.
 */

import { KNOWN_ELEMENT_TYPES } from "../schema/layout.ts";

/** Unscoped package id: lowercase start, letters/digits/dashes, up to 64. */
const EXTENSION_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

/** Element or source or panel name inside a package. */
const EXTENSION_NAME_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

/**
 * Full stored type. Looser than UnknownNode's generic 64-char cap so a long package
 * id still fits (limits may only loosen, D-065).
 */
const EXTENSION_TYPE_PATTERN = /^ext:[a-z][a-z0-9-]{0,63}\/[a-z][a-z0-9-]{0,31}$/;

const KNOWN = new Set<string>(KNOWN_ELEMENT_TYPES);

export function isExtensionType(type: string): boolean {
  return type.startsWith("ext:");
}

/** Parse `ext:pkg/name` into parts, or undefined when the string is not a valid extension type. */
export function parseExtensionType(type: string): { pkg: string; name: string } | undefined {
  if (!EXTENSION_TYPE_PATTERN.test(type)) return undefined;
  const body = type.slice("ext:".length);
  const slash = body.indexOf("/");
  if (slash <= 0) return undefined;
  const pkg = body.slice(0, slash);
  const name = body.slice(slash + 1);
  if (!EXTENSION_ID_PATTERN.test(pkg) || !EXTENSION_NAME_PATTERN.test(name)) return undefined;
  if (KNOWN.has(type) || KNOWN.has(pkg) || KNOWN.has(name)) return undefined;
  return { pkg, name };
}

export function extensionType(pkg: string, name: string): string | undefined {
  if (!EXTENSION_ID_PATTERN.test(pkg) || !EXTENSION_NAME_PATTERN.test(name)) return undefined;
  // A package id must not collide with a built-in element type.
  if (KNOWN.has(pkg) || KNOWN.has(name)) return undefined;
  const type = `ext:${pkg}/${name}`;
  if (KNOWN.has(type)) return undefined;
  return type;
}

/**
 * Why a candidate type or id is refused. Used by registration and by seeds that
 * try to escape the namespace.
 */
export function extensionNamespaceIssue(type: string): string | undefined {
  if (!type.startsWith("ext:")) return "Extension types must start with ext:";
  if (type.includes("..")) return "Extension types must not contain ..";
  if (type.includes(":")) {
    const rest = type.slice(4);
    if (rest.includes(":")) return "Extension types must not contain extra colons";
  }
  if (/[<>"'`]/.test(type) || [...type].some((ch) => (ch.codePointAt(0) ?? 0) < 32)) {
    return "Extension types must not contain HTML or control characters";
  }
  if (!EXTENSION_TYPE_PATTERN.test(type)) {
    return "Extension types must be ext:<package>/<name> with lowercase letters, digits and dashes";
  }
  if (KNOWN.has(type)) return "Extension types must not collide with built-in elements";
  return undefined;
}

export function extensionIdIssue(id: string): string | undefined {
  if (!EXTENSION_ID_PATTERN.test(id)) {
    return "Extension ids are lowercase, start with a letter, and use letters, digits and dashes only";
  }
  if (KNOWN.has(id)) return "Extension id collides with a built-in element type";
  return undefined;
}

export function extensionNameIssue(name: string): string | undefined {
  if (!EXTENSION_NAME_PATTERN.test(name)) {
    return "Extension names are lowercase, start with a letter, and use letters, digits and dashes only";
  }
  return undefined;
}
