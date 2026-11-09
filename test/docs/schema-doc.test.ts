import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  CONTRACT_VERSION,
  KNOWN_NODE_SCHEMAS,
  LAYOUT_SCHEMA_VERSION,
} from "../../packages/emvb/src/core/schema/layout.ts";
import { DESIGN_SCHEMA_VERSION as DESIGN } from "../../packages/emvb/src/core/schema/design.ts";
import { StyleProps } from "../../packages/emvb/src/core/schema/style.ts";
import {
  MAX_UNKNOWN_DEPTH,
  MAX_UNKNOWN_KEYS,
  UNKNOWN_KEY_PATTERN,
} from "../../packages/emvb/src/core/limits.ts";

// W-925: docs/SCHEMA.md names every element type, prop and style key, the versions and the D-065 limits.
const doc = readFileSync(new URL("../../docs/SCHEMA.md", import.meta.url), "utf8");
const keys = (schema: unknown) => Object.keys((schema as { shape?: object })?.shape ?? {});

describe("docs/SCHEMA.md", () => {
  test("states the contract, schema versions and unknown-key limits of the code", () => {
    expect(doc).toContain(`CONTRACT_VERSION = "${CONTRACT_VERSION}"`);
    expect(doc).toContain(`**layout schema ${LAYOUT_SCHEMA_VERSION}**`);
    expect(doc).toContain(`**design schema ${DESIGN}**`);
    expect(doc).toContain(`\`${UNKNOWN_KEY_PATTERN.source}\``);
    expect(doc).toContain(`\`MAX_UNKNOWN_KEYS\` (${MAX_UNKNOWN_KEYS})`);
    expect(doc).toContain(`\`MAX_UNKNOWN_DEPTH\` (${MAX_UNKNOWN_DEPTH})`);
  });

  test("lists every element type with its props, and every style key", () => {
    const rows = new Map<string, string>();
    for (const line of doc.split("\n")) {
      const match = /^\| ((?:`[a-z-]+`(?:, )?)+) \| (.*) \|$/.exec(line);
      if (!match) continue;
      for (const type of match[1]?.match(/`([a-z-]+)`/g) ?? [])
        rows.set(type.slice(1, -1), match[2] ?? "");
    }
    for (const schema of KNOWN_NODE_SCHEMAS) {
      const shape = (schema as unknown as { shape: Record<string, unknown> }).shape;
      const type = (shape["type"] as { value: string }).value;
      expect({ type, row: rows.has(type) }).toEqual({ type, row: true });
      const listed = (rows.get(type) ?? "").split(", ").map((p) => p.trim());
      const props = keys(shape["props"]);
      expect({ type, props: props.length === 0 ? ["(none)"] : props }).toEqual({
        type,
        props: listed,
      });
    }
    for (const key of keys(StyleProps))
      expect({ key, listed: doc.includes(key) }).toEqual({ key, listed: true });
  });
});
