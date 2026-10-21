import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { auditPage } from "./audit.ts";

const rulesFor = (props: Record<string, unknown>) =>
  auditPage(
    {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "head0001", type: "heading", props: { text: "T", level: 1 } },
          { id: "imag0001", type: "image", props: { alt: "A cat", ...props } } as LayoutNode,
        ],
      },
    } as Layout,
    emptyDesign(),
  ).issues.map((i) => i.rule);

const sources = [{ src: "/a-480.jpg", width: 480 }];

describe("extra sizes without a Width are flagged (W-403)", () => {
  test("sources and no width warn", () => {
    expect(rulesFor({ src: "/a.jpg", sources })).toEqual(["image-sizes"]);
  });
  test("a width, the main image listed, or no sources are fine", () => {
    expect(rulesFor({ src: "/a.jpg", sources, width: 1600 })).toEqual([]);
    expect(
      rulesFor({ src: "/a.jpg", sources: [...sources, { src: "/a.jpg", width: 1600 }] }),
    ).toEqual([]);
    expect(rulesFor({ src: "/a.jpg" })).toEqual([]);
  });
});
