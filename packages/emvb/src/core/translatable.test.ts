import { describe, expect, test } from "bun:test";
import type { Layout } from "./schema/layout.ts";
import { translatableStrings } from "./translatable.ts";

const layout = {
  schemaVersion: 18,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "head0001", type: "heading", props: { text: "Welcome", level: 1, href: "/about" } },
      { id: "img00001", type: "image", props: { src: "/a.png", alt: "A red door" } },
      { id: "list0001", type: "list", props: { items: ["One", "", "Two"] } },
      { id: "text0001", type: "text", props: { text: "   " } },
      {
        id: "inpt0001",
        type: "text-input",
        props: { field: "email", label: "Email", placeholder: "you@example.com" },
      },
    ],
  },
} as unknown as Layout;

describe("translatable strings (W-936)", () => {
  test("texts, alt text and list items in page order; links, blanks, ids and form field names left out", () => {
    expect(translatableStrings(layout)).toEqual([
      { nodeId: "head0001", key: "text", text: "Welcome" },
      { nodeId: "img00001", key: "alt", text: "A red door" },
      { nodeId: "list0001", key: "items.0", text: "One" },
      { nodeId: "list0001", key: "items.2", text: "Two" },
      { nodeId: "inpt0001", key: "label", text: "Email" },
      { nodeId: "inpt0001", key: "placeholder", text: "you@example.com" },
    ]);
  });
});
