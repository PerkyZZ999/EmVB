import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import { renderPage } from "./index.ts";

const entry = (n: number) => ({
  id: `e${n}`,
  slug: `e-${n}`,
  title: `Entry ${n}`,
  excerpt: "",
  content: "",
  permalink: `/p/e-${n}`,
});

describe("ids inside a Loop (W-649)", () => {
  test("each id appears once on the page, even when the item design repeats", () => {
    const layout = {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "toc00001", type: "toc", props: {} },
          {
            id: "loop0001",
            type: "loop",
            props: { collection: "projects" },
            children: [
              { id: "head0001", type: "heading", props: { text: "Hi", level: 2 }, htmlId: "intro" },
              { id: "head0002", type: "heading", props: { text: "Yo", level: 3 } },
            ],
          },
        ],
      },
    };
    const { html } = renderPage(layout as never, emptyDesign(), {
      dynamic: { collections: { loop0001: [entry(1), entry(2), entry(3)] } } as never,
    });
    expect(html.match(/id="intro"/g)?.length).toBe(1);
    expect(html.match(/id="emvb-h-head0002"/g)?.length).toBe(1);
    expect(html).toContain('href="#emvb-h-head0002"');
  });
});
