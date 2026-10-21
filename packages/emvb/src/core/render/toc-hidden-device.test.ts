import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, type Layout } from "../index.ts";

const heading = (id: string, text: string, hiddenOn?: ("desktop" | "tablet" | "mobile")[]) => ({
  id,
  type: "heading" as const,
  props: { text, level: 2 as const },
  ...(hiddenOn ? { hiddenOn } : {}),
});

describe("W-793 contents entries hide where their heading hides", () => {
  const layout: Layout = {
    schemaVersion: 16,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        { id: "toc00001", type: "toc", props: {} },
        heading("hd000001", "Shown"),
        heading("hd000002", "Phones hide me", ["mobile"]),
        {
          id: "sec00001",
          type: "container",
          props: {},
          hiddenOn: ["tablet"],
          children: [heading("hd000003", "Tablets hide my section")],
        },
        {
          id: "sec00002",
          type: "container",
          props: {},
          hiddenOn: ["mobile"],
          children: [heading("hd000004", "Never shown", ["desktop", "tablet"])],
        },
      ],
    },
  } as Layout;
  const { html, css } = renderPage(layout, emptyDesign());
  const entry = (text: string) => html.match(new RegExp(`<li[^>]*><a[^>]*>${text}</a></li>`))?.[0];

  test("an entry always shown has no hide class", () => {
    expect(entry("Shown")).toBe('<li><a href="#emvb-h-hd000001">Shown</a></li>');
  });
  test("a heading hidden on phones hides its entry on phones", () => {
    expect(entry("Phones hide me")).toContain('class="emvb-e-toc-hd000002"');
    const mobileHide = css.match(
      /@media[^{]*\{([^{}]*\.emvb-e-toc-hd000002[^{}]*)\{display:none\}/,
    );
    expect(mobileHide).not.toBeNull();
    expect(css).toContain(".emvb-e-toc-hd000002");
  });
  test("a heading inside a section hidden on tablets hides its entry on tablets", () => {
    expect(entry("Tablets hide my section")).toContain('class="emvb-e-toc-hd000003"');
  });
  test("a heading hidden on every device by itself and its section gets no entry", () => {
    expect(entry("Never shown")).toBeUndefined();
  });
});
