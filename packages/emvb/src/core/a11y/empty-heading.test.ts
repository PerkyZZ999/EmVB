import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { auditPage } from "./audit.ts";

const rules = (text: string) =>
  auditPage(
    {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "head0001", type: "heading", props: { text: "T", level: 1 } },
          { id: "head0002", type: "heading", props: { text, level: 2 } },
        ],
      },
    } as Layout,
    emptyDesign(),
  ).issues.map((i) => `${i.rule}:${i.nodeId}`);

describe("empty headings are flagged (W-419)", () => {
  test("blank text warns", () => {
    expect(rules("  ")).toEqual(["empty-heading:head0002"]);
  });
  test("text is fine", () => {
    expect(rules("Pricing")).toEqual([]);
  });
});
