import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, type Layout, type LayoutNode } from "../index.ts";

const design = emptyDesign();
const page = (child: LayoutNode): Layout => ({
  schemaVersion: 16,
  root: { id: "root0001", type: "container", props: {}, children: [child] },
});
const link = (href: string) =>
  ({ id: "link0001", type: "link", props: { text: "Docs", href, newTab: true } }) as LayoutNode;

describe("W-276 a link without a URL doesn't open a new tab", () => {
  test("an empty URL renders # without target or rel", () => {
    const { html } = renderPage(page(link("")), design);
    expect(html).toContain('<a class="emvb-link" href="#">Docs</a>');
  });
  test("a refused URL too", () => {
    expect(renderPage(page(link("javascript:alert(1)")), design).html).not.toContain("_blank");
  });
  test("a real URL still opens in a new tab", () => {
    const { html } = renderPage(page(link("https://example.com")), design);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});

test("W-684: every element's new-tab switch has the same label", async () => {
  const { ELEMENTS } = await import("./index.ts");
  const labels = new Set<string>();
  for (const def of Object.values(ELEMENTS)) {
    const { descriptor } = def as { descriptor?: { fields?: { key: string; label: string }[] } };
    for (const field of descriptor?.fields ?? []) {
      if (field.key === "newTab") labels.add(field.label);
    }
  }
  // The Image's switch names the link, since the image itself isn't one.
  labels.delete("Open link in a new tab");
  expect([...labels]).toEqual(["Open in a new tab"]);
});

test("UX-044: elements that are links name their fields Text and URL", async () => {
  const { ELEMENTS } = await import("./index.ts");
  const names = (type: string) => {
    const { descriptor } = (ELEMENTS as Record<string, unknown>)[type] as {
      descriptor: { fields: { key: string; label: string }[] };
    };
    const label = (key: string) => descriptor.fields.find((f) => f.key === key)?.label;
    return `${type}: ${label("text")} / ${label("href")}`;
  };
  expect(["link", "button", "menu-item"].map(names)).toEqual([
    "link: Text / URL",
    "button: Text / URL",
    "menu-item: Text / URL",
  ]);
});

test("UX-059: HTML tag choices read as words, with p named Paragraph", async () => {
  const { ELEMENTS } = await import("./index.ts");
  const tagLabels = (type: string) => {
    const { descriptor } = (ELEMENTS as Record<string, unknown>)[type] as {
      descriptor: { fields: { key: string; options?: { label: string }[] }[] };
    };
    return descriptor.fields.find((f) => f.key === "tag")?.options?.map((o) => o.label);
  };
  expect(tagLabels("text")).toEqual(["Paragraph (p)", "Div"]);
  expect(tagLabels("container")?.slice(0, 3)).toEqual(["Div", "Section", "Header"]);
});
