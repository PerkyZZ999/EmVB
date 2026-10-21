import { describe, expect, test } from "bun:test";
import { emptyDesign, type Layout } from "../index.ts";
import { auditPage } from "./audit.ts";

const page = (box: Record<string, unknown>): Layout =>
  ({
    schemaVersion: 17,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [{ id: "box00001", type: "container", ...box }],
    },
  }) as unknown as Layout;
const flagged = (box: Record<string, unknown>) =>
  auditPage(page(box), emptyDesign()).issues.some((i) => i.id === "link-name:box00001");
const icon = (props: Record<string, unknown>) => ({
  id: "ic000001",
  type: "icon",
  props: { iconId: "arrow-right", ...props },
});

describe("W-798 a linked box needs something to name its link", () => {
  test("a linked box holding only a decorative icon is flagged", () => {
    expect(flagged({ props: { href: "/e" }, children: [icon({ decorative: true })] })).toBe(true);
    expect(flagged({ props: { href: "/e" }, children: [] })).toBe(true);
  });
  test("text, a heading, an image's alt or an icon's title name it", () => {
    expect(
      flagged({
        props: { href: "/e" },
        children: [{ id: "tx000001", type: "text", props: { text: "Go" } }],
      }),
    ).toBe(false);
    expect(
      flagged({
        props: { href: "/e" },
        children: [{ id: "im000001", type: "image", props: { src: "/a.png", alt: "Shop" } }],
      }),
    ).toBe(false);
    expect(flagged({ props: { href: "/e" }, children: [icon({ title: "Next" })] })).toBe(false);
  });
  test("a box that is not a link is not flagged", () => {
    expect(flagged({ props: {}, children: [icon({ decorative: true })] })).toBe(false);
    expect(
      flagged({ props: { href: "/e", tag: "section" }, children: [icon({ decorative: true })] }),
    ).toBe(false);
    expect(
      flagged({ props: { href: "javascript:x" }, children: [icon({ decorative: true })] }),
    ).toBe(false);
    expect(
      flagged({
        props: { href: "/e" },
        children: [
          icon({ decorative: true }),
          { id: "ln000001", type: "link", props: { text: "In", href: "/x" } },
        ],
      }),
    ).toBe(false);
  });
});
