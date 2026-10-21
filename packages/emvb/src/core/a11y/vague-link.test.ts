import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { auditPage } from "./audit.ts";

const vague = (text: string) =>
  auditPage(
    {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "head0001", type: "heading", props: { text: "T", level: 1 } },
          { id: "link0001", type: "link", props: { text, href: "/x" } } as LayoutNode,
        ],
      },
    } as Layout,
    emptyDesign(),
  ).issues.some((i) => i.rule === "vague-link");

describe("vague link text with trailing marks (W-411)", () => {
  test("punctuation and arrows don't hide vague text", () => {
    for (const text of ["Read more…", "Learn more →", "Click here!", "More »", "Read more ..."]) {
      expect([text, vague(text)]).toEqual([text, true]);
    }
  });
  test("specific text is fine", () => {
    expect(vague("Read more about pricing")).toBe(false);
  });
});
