import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { auditPage } from "./audit.ts";

// #949494 on white is about 3:1: enough for large text, not for small.
const contrast = (fontSizes: unknown[]) =>
  auditPage(
    {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        style: { backgroundColor: "#ffffff" },
        children: [
          {
            id: "head0001",
            type: "heading",
            props: { text: "T", level: 1 },
            style: { color: "#949494", fontSize: { var: "small", from: "fontSize" } },
          },
        ],
      },
    } as unknown as Layout,
    { ...emptyDesign(), variables: { ...emptyDesign().variables, fontSizes } } as never,
  ).issues.filter((i) => i.rule === "contrast").length;

describe("contrast and font size variables (W-651)", () => {
  test("a heading sized by a small variable needs 4.5:1", () => {
    expect(contrast([{ id: "small", name: "Small", value: { value: 14, unit: "px" } }])).toBe(1);
  });
  test("a fluid variable counts at its smallest", () => {
    expect(
      contrast([
        {
          id: "small",
          name: "Small",
          value: { value: 40, unit: "px" },
          fluid: { min: 14, max: 40 },
        },
      ]),
    ).toBe(1);
  });
  test("a large variable still needs only 3:1", () => {
    expect(contrast([{ id: "small", name: "Big", value: { value: 32, unit: "px" } }])).toBe(0);
  });
});
