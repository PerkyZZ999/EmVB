import { describe, expect, test } from "bun:test";
import { PAGES_COLLECTION, THEME_PARTS_COLLECTION } from "../../src/constants.ts";
import { defaultConditionsFor, defaultTriggers } from "../../src/core/index.ts";
import { beforeSave } from "../../src/server/hooks.ts";

function run(collection: string, content: Record<string, unknown>) {
  const warnings: unknown[][] = [];
  const ctx = { log: { warn: (...args: unknown[]) => void warnings.push(args) } } as never;
  const result = beforeSave({ collection, id: "01PART", content, isNew: false }, ctx);
  return { result, warnings };
}

describe("content:beforeSave on theme parts (R-061)", () => {
  test("valid conditions and triggers are stored as validated, from objects or JSON strings", async () => {
    const conditions = defaultConditionsFor("header");
    const triggers = defaultTriggers();
    const { result } = run(THEME_PARTS_COLLECTION, {
      title: "Header",
      conditions: JSON.stringify(conditions),
      triggers,
    });
    expect(await result).toEqual({ title: "Header", conditions, triggers });
  });

  test("invalid conditions are rejected with a message and a logged code", async () => {
    const { result, warnings } = run(THEME_PARTS_COLLECTION, { conditions: { rules: "nope" } });
    const error = await result.then(
      () => null,
      (e: Error) => e,
    );
    expect(error?.message).toStartWith("The theme part conditions are invalid.");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.[0]).toBe("emvb: theme part save rejected");
    expect(warnings[0]?.[1]).toMatchObject({ pageId: "01PART" });
  });

  test("invalid triggers are rejected with a message and a logged code", async () => {
    const { result, warnings } = run(THEME_PARTS_COLLECTION, { triggers: "{not json" });
    const error = await result.then(
      () => null,
      (e: Error) => e,
    );
    expect(error?.message).toStartWith("The theme part triggers are invalid.");
    expect(warnings[0]?.[1]).toMatchObject({ pageId: "01PART" });
  });

  test("pages don't validate theme-part fields, and parts without them are unchanged", async () => {
    expect(await run(PAGES_COLLECTION, { conditions: { rules: "nope" } }).result).toBeUndefined();
    expect(await run(THEME_PARTS_COLLECTION, { title: "Plain" }).result).toBeUndefined();
  });
});
