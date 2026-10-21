import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { auditPage } from "./audit.ts";

const page = (node: LayoutNode): Layout =>
  ({
    schemaVersion: 17,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [{ id: "head0001", type: "heading", props: { text: "T", level: 1 } }, node],
    },
  }) as Layout;

const message = (props: Record<string, unknown>) =>
  auditPage(
    page({ id: "butn0001", type: "button", props } as LayoutNode),
    emptyDesign(),
  ).issues.find((i) => i.rule === "link-name")?.message;

describe("a nameless button is called a button (W-400)", () => {
  test("icon-only button with no URL", () => {
    expect(message({ text: "", iconId: "ph:x" })).toBe(
      "This icon-only button has no text or title, so it has no name.",
    );
  });

  test("text-less button with no URL", () => {
    expect(message({ text: "" })).toBe("This button has no text.");
  });

  test("with a URL it is a link", () => {
    expect(message({ text: "", href: "/pricing", iconId: "ph:x" })).toBe("This link has no text.");
  });
});
