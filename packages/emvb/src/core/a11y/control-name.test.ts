import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { auditPage } from "./audit.ts";

const rules = (...children: LayoutNode[]) =>
  auditPage(
    {
      schemaVersion: 17,
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
  ).issues.map((i) => `${i.rule}:${i.nodeId}`);

const tabs = (label: string) =>
  ({
    id: "tabs0001",
    type: "tabs",
    props: {},
    children: [{ id: "tabp0001", type: "tab-panel", props: { label }, children: [] }],
  }) as LayoutNode;
const accordion = (summary: string) =>
  ({
    id: "acco0001",
    type: "accordion",
    props: {},
    children: [{ id: "acci0001", type: "accordion-item", props: { summary }, children: [] }],
  }) as LayoutNode;

describe("blank tab labels and accordion titles are flagged (W-408)", () => {
  test("blank ones are errors", () => {
    expect(rules(tabs("  "), accordion(" "))).toEqual([
      "control-name:tabp0001",
      "control-name:acci0001",
    ]);
  });
  test("named ones are fine", () => {
    expect(rules(tabs("Plans"), accordion("Shipping"))).toEqual([]);
  });
});

describe("a blank video title is flagged (W-410)", () => {
  const video = (title: string) =>
    ({
      id: "vide0001",
      type: "video",
      props: { url: "https://vimeo.com/76979871", title },
    }) as LayoutNode;
  test("blank title is an error, a real one is fine", () => {
    expect(rules(video("  "))).toEqual(["control-name:vide0001"]);
    expect(rules(video("Product tour"))).toEqual([]);
  });
});
