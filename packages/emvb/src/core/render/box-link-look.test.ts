import { describe, expect, test } from "bun:test";
import { ELEMENTS } from "../elements/index.ts";
import { emptyDesign, renderPage, type Layout } from "../index.ts";

const RESET = ":where(a.emvb-box-link){color:inherit;text-decoration:inherit}";

describe("W-797 a linked box keeps its content's look", () => {
  for (const type of ["container", "div-block", "flexbox", "grid"] as const) {
    test(`a linked ${type} is an a.emvb-box-link and its page ships the reset`, () => {
      const layout = {
        schemaVersion: 17,
        root: {
          id: "root0001",
          type: "container",
          props: {},
          children: [
            {
              id: "box00001",
              type,
              props: { href: "/card", ...(type === "grid" ? { columns: 2 } : {}) },
              children: [{ id: "tx000001", type: "text", props: { text: "Card" } }],
            },
          ],
        },
      } as Layout;
      const { html, css } = renderPage(layout, emptyDesign());
      expect(html).toMatch(/<a class="[^"]*\bemvb-box-link\b[^"]*" href="\/card"/);
      expect(css).toContain(RESET);
    });
  }
  test("every box type ships the reset in its own base CSS (W-792)", () => {
    for (const type of ["container", "div-block", "flexbox", "grid"] as const) {
      expect(ELEMENTS[type].baseCss).toContain(RESET);
    }
  });
  test("a box that stays a div gets no link class", () => {
    const { html } = renderPage(
      {
        schemaVersion: 17,
        root: {
          id: "root0001",
          type: "container",
          props: {},
          children: [{ id: "box00001", type: "container", props: {}, children: [] }],
        },
      } as Layout,
      emptyDesign(),
    );
    expect(html).not.toContain("emvb-box-link");
  });
});
