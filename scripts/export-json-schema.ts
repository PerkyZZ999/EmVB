// W-925: writes the contract 1.0 JSON Schema exports to docs/schema/. `--check` fails when a
// file differs from what the code would write (the test in export-json-schema.test.ts runs it).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { designJsonSchema, layoutJsonSchema } from "../packages/emvb/src/core/json-schema.ts";

const DIR = join(import.meta.dir, "..", "docs", "schema");

export const SCHEMA_FILES = {
  "layout.schema.json": layoutJsonSchema,
  "design.schema.json": designJsonSchema,
} as const;

export const expected = (name: keyof typeof SCHEMA_FILES): string =>
  `${JSON.stringify(SCHEMA_FILES[name](), null, 2)}\n`;

/** File names whose content is not what the code would write now. */
export function staleSchemaFiles(): string[] {
  return (Object.keys(SCHEMA_FILES) as (keyof typeof SCHEMA_FILES)[]).filter((name) => {
    try {
      return readFileSync(join(DIR, name), "utf8") !== expected(name);
    } catch {
      return true;
    }
  });
}

if (import.meta.main) {
  if (process.argv.includes("--check")) {
    const stale = staleSchemaFiles();
    if (stale.length > 0) {
      process.stderr.write(
        `docs/schema is out of date: ${stale.join(", ")}. Run bun scripts/export-json-schema.ts\n`,
      );
      process.exit(1);
    }
    process.stdout.write("docs/schema is up to date\n");
  } else {
    for (const name of Object.keys(SCHEMA_FILES) as (keyof typeof SCHEMA_FILES)[]) {
      writeFileSync(join(DIR, name), expected(name));
      process.stdout.write(`wrote docs/schema/${name}\n`);
    }
  }
}
