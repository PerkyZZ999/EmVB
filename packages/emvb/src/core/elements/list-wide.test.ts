import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, type Layout } from "../index.ts";

const page = (ordered: boolean, count: number) =>
  renderPage(
    {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "lst00001",
            type: "list",
            props: {
              ordered,
              items: [...Array.from({ length: count }, (_, i) => `Item ${i}`), " "],
            },
          },
        ],
      },
    } as Layout,
    emptyDesign(),
  );

describe("W-796 three-digit list numbers fit inside the list", () => {
  test("a numbered list with 100 shown items gets the wide indent, and the CSS for it", () => {
    const { html, css } = page(true, 100);
    expect(html).toMatch(/<ol class="[^"]*\bemvb-list--wide\b/);
    expect(css).toContain(".emvb-list--wide{padding-inline-start:2.25em}");
  });
  test("99 shown items (a blank one not counted) and bulleted lists keep the normal indent", () => {
    expect(page(true, 99).html).not.toContain("emvb-list--wide");
    expect(page(false, 150).html).not.toContain("emvb-list--wide");
  });
});
