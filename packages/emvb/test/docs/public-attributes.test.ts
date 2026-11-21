import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PUBLIC_DATA_ATTRIBUTES } from "../../src/core/public-attributes.ts";

/** Named on that line, but editor-only (`data-emvb-id`) or set by a runtime after load. */
const NOT_HOOKS = new Set([
  "data-emvb-id",
  "data-emvb-menu-dismissed",
  "data-emvb-ready",
  "data-emvb-shown",
  "data-emvb-theme",
]);

const DOC = join(import.meta.dir, "../../../../docs/system/layout-format.md");

describe("public data-emvb hooks in the docs (W-962)", () => {
  test("the allow-list is exactly the list in layout-format.md", () => {
    const line = readFileSync(DOC, "utf8")
      .split("\n")
      .find((l) => l.includes("PUBLIC_DATA_ATTRIBUTES"));
    const listed = [...(line ?? "").matchAll(/`(data-emvb-[a-z-]+)`/g)]
      .map((m) => m[1])
      .filter((name) => !NOT_HOOKS.has(name ?? ""));
    expect(listed.toSorted()).toEqual([...PUBLIC_DATA_ATTRIBUTES].toSorted());
  });
});
