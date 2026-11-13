import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { auditPage } from "./audit.ts";

// The 1.2 widgets (PLAN_1.2 part D): what the accessibility check says about each.
const audit = (...children: unknown[]) =>
  auditPage(
    {
      schemaVersion: 18,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "head0001", type: "heading", props: { text: "T", level: 1 } },
          ...children,
        ],
      },
    } as Layout,
    emptyDesign(),
  ).issues.map((i) => `${i.rule}:${i.severity}:${i.nodeId}`);

describe("Star rating (W-1023)", () => {
  const rating = (label?: string) => ({
    id: "rate0001",
    type: "rating",
    props: { value: 4, ...(label === undefined ? {} : { label }) },
  });

  test("the default text, or one with {value} or a number, says the rating", () => {
    expect(audit(rating())).toEqual([]);
    expect(audit(rating("{value} stars"))).toEqual([]);
    expect(audit(rating("Four out of five: 4/5"))).toEqual([]);
  });

  test("custom text that doesn't say the rating warns", () => {
    expect(audit(rating("Customer rating"))).toEqual(["image-alt:warning:rate0001"]);
  });
});

describe("Alert (W-1025)", () => {
  const alert = (props: Record<string, unknown>) => ({
    id: "alrt0001",
    type: "alert",
    props: { variant: "info", text: "", ...props },
  });

  test("a title or text is enough", () => {
    expect(audit(alert({ text: "Saved." }))).toEqual([]);
    expect(audit(alert({ title: "Saved" }))).toEqual([]);
  });

  test("an empty one warns", () => {
    expect(audit(alert({ title: " ", text: "\u200b" }))).toEqual(["empty-alert:warning:alrt0001"]);
  });
});
