import { boundedArray } from "../bounded-array.ts";
/**
 * Compile an extension's declarative prop schema into Zod, with EmVB limits on top
 * (W-927). Extensions never pass us a Zod instance — only ExtensionPropSchema.
 */

import { z } from "zod";
import { MAX_TEXT_LENGTH } from "../limits.ts";
import type { ExtensionPropSchema } from "./types.ts";

/** Hard caps on top of whatever the extension declares (limits may only loosen later). */
const EXT_MAX_STRING = MAX_TEXT_LENGTH;
const EXT_MAX_ARRAY = 32;
const EXT_MAX_OBJECT_KEYS = 32;
const EXT_MAX_DEPTH = 4;
const EXT_MAX_NUMBER = 1_000_000_000;

const FIELD_KINDS = new Set(["text", "textarea", "number", "int", "select", "boolean", "href"]);

export function isAllowedExtensionFieldKind(kind: string): boolean {
  return FIELD_KINDS.has(kind);
}

function compileAt(schema: ExtensionPropSchema, depth: number): z.ZodType {
  if (depth > EXT_MAX_DEPTH) {
    return z.never();
  }
  switch (schema.type) {
    case "string": {
      const max = Math.min(schema.maxLength ?? EXT_MAX_STRING, EXT_MAX_STRING);
      const min = Math.max(0, schema.minLength ?? 0);
      let s = z.string().max(max);
      if (min > 0) s = s.min(min);
      return schema.default !== undefined ? s.default(schema.default) : s;
    }
    case "number": {
      const min = schema.min ?? -EXT_MAX_NUMBER;
      const max = Math.min(schema.max ?? EXT_MAX_NUMBER, EXT_MAX_NUMBER);
      let n = z.number().min(min).max(max);
      if (schema.integer) n = n.int();
      return schema.default !== undefined ? n.default(schema.default) : n;
    }
    case "boolean": {
      const b = z.boolean();
      return schema.default !== undefined ? b.default(schema.default) : b;
    }
    case "enum": {
      const values = schema.values
        .filter((v) => typeof v === "string" && v.length <= 64)
        .slice(0, 32);
      if (values.length === 0) return z.never();
      const e = z.enum(values as [string, ...string[]]);
      return schema.default !== undefined && values.includes(schema.default)
        ? e.default(schema.default)
        : e;
    }
    case "array": {
      const maxItems = Math.min(schema.maxItems ?? EXT_MAX_ARRAY, EXT_MAX_ARRAY);
      const a = boundedArray(compileAt(schema.items, depth + 1), maxItems);
      return schema.default !== undefined ? a.default([...schema.default]) : a;
    }
    case "object": {
      const keys = Object.keys(schema.properties).slice(0, EXT_MAX_OBJECT_KEYS);
      const shape: Record<string, z.ZodType> = {};
      const required = new Set(schema.required ?? []);
      for (const key of keys) {
        if (!/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(key)) continue;
        const prop = schema.properties[key];
        if (!prop) continue;
        const compiled = compileAt(prop, depth + 1);
        shape[key] = required.has(key) ? compiled : compiled.optional();
      }
      return z.object(shape).strict();
    }
    default:
      return z.never();
  }
}

/** Zod schema for one element's props. Unknown keys are stripped (strict object leaves). */
function compileExtensionProps(schema: ExtensionPropSchema): z.ZodType {
  return compileAt(schema, 0);
}

/** Defaults implied by the schema (and any `defaults()` the extension supplies). */
export function schemaDefaults(schema: ExtensionPropSchema): Record<string, unknown> {
  if (schema.type !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(schema.properties)) {
    if ("default" in prop && prop.default !== undefined) out[key] = prop.default;
  }
  return out;
}

/**
 * Validate untrusted stored props. On failure returns the schema defaults (so a
 * bad value never reaches render) and `ok: false`.
 */
export function validateExtensionProps(
  schema: ExtensionPropSchema,
  input: unknown,
): { ok: true; props: Record<string, unknown> } | { ok: false; props: Record<string, unknown> } {
  const compiled = compileExtensionProps(schema);
  const result = compiled.safeParse(input ?? {});
  if (result.success) {
    const props =
      result.data && typeof result.data === "object" && !Array.isArray(result.data)
        ? (result.data as Record<string, unknown>)
        : {};
    return { ok: true, props };
  }
  return { ok: false, props: schemaDefaults(schema) };
}
