import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PUBLIC_DATA_ATTRIBUTES } from "../../src/core/public-attributes.ts";

const DOC = join(import.meta.dir, "../../../../docs/system/layout-format.md");

describe("public data-emvb hooks in the docs (W-962)", () => {
  test("the allow-list is exactly the list in layout-format.md", () => {
    const line = readFileSync(DOC, "utf8")
      .split("\n")
      .find((l) => l.includes("PUBLIC_DATA_ATTRIBUTES"));
    const listed = [...(line ?? "").matchAll(/`(data-emvb-[a-z-]+)`/g)]
      .map((m) => m[1])
      .filter((name) => name !== "data-emvb-id" && name !== "data-emvb-menu-dismissed");
    expect(listed.toSorted()).toEqual([...PUBLIC_DATA_ATTRIBUTES].toSorted());
  });
});
