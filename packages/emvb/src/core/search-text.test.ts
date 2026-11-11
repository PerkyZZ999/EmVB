import { expect, test } from "bun:test";
import { layoutSearchText } from "./search-text.ts";

const layout = {
  schemaVersion: 18,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "head0001", type: "heading", props: { text: "Garden tours", level: 1 } },
      { id: "list0001", type: "list", props: { items: ["Roses", "Tulips"] } },
      { id: "imag0001", type: "image", props: { src: "https://x.test/a.png", alt: "A pond" } },
      { id: "butt0001", type: "button", props: { text: "Book now", href: "/secret-url" } },
    ],
  },
};

test("W-978: a layout's words, in reading order, without URLs or ids", () => {
  expect(layoutSearchText(layout)).toBe("Garden tours Roses Tulips A pond Book now");
  expect(layoutSearchText(JSON.stringify(layout))).toBe(
    "Garden tours Roses Tulips A pond Book now",
  );
});

test("W-978: unreadable layouts give no words, and a huge one is capped", () => {
  expect(layoutSearchText(undefined)).toBe("");
  expect(layoutSearchText("{nope")).toBe("");
  const many = {
    root: {
      type: "container",
      props: {},
      children: Array.from({ length: 5000 }, (_, i) => ({
        type: "text",
        props: { text: `Paragraph ${i} with some words` },
      })),
    },
  };
  expect(layoutSearchText(many).length).toBeLessThanOrEqual(20_000);
});
