// oxlint-disable no-underscore-dangle -- Portable Text names its fields _type, _key and _ref.
import { expect, test } from "bun:test";
import { portableTextToLayout } from "./portable-text.ts";
import { layoutToPortableText } from "./portable-text-export.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout, type LayoutNode } from "./schema/layout.ts";

const layout = (children: LayoutNode[]): Layout => ({
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: { id: "root0001", type: "container", props: {}, children },
});
const keys = () => {
  let n = 0;
  return () => `k${n++}`;
};
const texts = (body: ReturnType<typeof layoutToPortableText>["body"]) =>
  body.map((b) =>
    b._type === "block"
      ? `${b.listItem ?? b.style}:${b.children.map((c) => c.text).join("")}`
      : `image:${b.asset.url}`,
  );

test("words, headings, lists and images come across in reading order (W-963)", () => {
  const out = layoutToPortableText(
    layout([
      { id: "h1", type: "heading", props: { text: "Welcome", level: 1 } },
      {
        id: "row1",
        type: "flexbox",
        props: {},
        children: [
          { id: "t1", type: "text", props: { text: "Left column" } },
          {
            id: "i1",
            type: "image",
            props: {
              src: "/_emdash/api/media/file/a.jpg",
              alt: "A cat",
              mediaId: "m1",
              width: 640,
            },
          },
        ],
      } as LayoutNode,
      { id: "l1", type: "list", props: { items: ["One", "", "Two"], ordered: true } },
      { id: "b1", type: "button", props: { text: "Buy", href: "/shop" } },
      { id: "s1", type: "spacer", props: {} } as LayoutNode,
      { id: "f1", type: "form", props: { formId: "x" }, children: [] } as LayoutNode,
      { id: "d1", type: "divider", props: {} } as LayoutNode,
    ]),
    { key: keys() },
  );
  expect(texts(out.body)).toEqual([
    "h1:Welcome",
    "normal:Left column",
    "image:/_emdash/api/media/file/a.jpg",
    "number:One",
    "number:Two",
    "normal:Buy",
  ]);
  expect(out.converted).toBe(5);
  expect(out.skipped).toEqual({ form: 1, divider: 1 });
  const image = out.body[2];
  expect(image).toEqual({
    _type: "image",
    _key: expect.any(String),
    asset: { url: "/_emdash/api/media/file/a.jpg", _ref: "m1" },
    alt: "A cat",
    width: 640,
  });
  const button = out.body[5];
  expect(button?._type === "block" && button.markDefs).toEqual([
    { _type: "link", _key: expect.any(String), href: "/shop" },
  ]);
});

test("bold, italic and links on words become marks (W-963)", () => {
  const out = layoutToPortableText(
    layout([
      {
        id: "t1",
        type: "text",
        props: {
          text: "Read our guide today",
          marks: [
            { start: 0, end: 4, bold: true },
            { start: 9, end: 14, href: "https://example.com/g", newTab: true, italic: true },
          ],
        },
      },
    ]),
    { key: keys() },
  );
  const block = out.body[0];
  if (block?._type !== "block") throw new Error("no block");
  const link = block.markDefs[0];
  expect(link).toMatchObject({ _type: "link", href: "https://example.com/g", blank: true });
  expect(block.children.map((c) => [c.text, c.marks])).toEqual([
    ["Read", ["strong"]],
    [" our ", []],
    ["guide", ["em", link?._key ?? "missing"]],
    [" today", []],
  ]);
});

test("unsafe links are dropped, the words kept", () => {
  const out = layoutToPortableText(
    layout([
      { id: "b1", type: "button", props: { text: "Click", href: "javascript:alert(1)" } },
      { id: "i1", type: "image", props: { src: "data:image/png;base64,AA", alt: "x" } },
    ]),
  );
  expect(out.body).toHaveLength(1);
  expect(out.body[0]?._type === "block" && out.body[0].markDefs).toEqual([]);
  expect(out.skipped).toEqual({ image: 1 });
});

test("tabs and accordions read as a heading per panel, then its content", () => {
  const out = layoutToPortableText(
    layout([
      {
        id: "tabs1",
        type: "tabs",
        props: {},
        children: [
          {
            id: "p1",
            type: "tab-panel",
            props: { label: "Specs" },
            children: [{ id: "t1", type: "text", props: { text: "Steel" } }],
          },
        ],
      } as LayoutNode,
    ]),
  );
  expect(texts(out.body)).toEqual(["h3:Specs", "normal:Steel"]);
});

test("synced sections bring their words; an A/B test keeps only A", () => {
  const section = layout([{ id: "x1", type: "text", props: { text: "From the section" } }]);
  const out = layoutToPortableText(
    layout([
      { id: "ref1", type: "part-ref", props: { partId: "sec" }, children: [] } as LayoutNode,
      { id: "a1", type: "text", props: { text: "Arm A" }, variant: { test: "t", arm: "a" } },
      { id: "b1", type: "text", props: { text: "Arm B" }, variant: { test: "t", arm: "b" } },
    ]),
    { sectionTemplates: { sec: section } },
  );
  expect(texts(out.body)).toEqual(["normal:From the section", "normal:Arm A"]);
  expect(out.skipped).toEqual({ "A/B test variant": 1 });
});

test("Convert to EmVB reads the result back (round trip)", () => {
  const source = layout([
    { id: "h1", type: "heading", props: { text: "About", level: 2 } },
    { id: "t1", type: "text", props: { text: "We make things." } },
    { id: "l1", type: "list", props: { items: ["Fast", "Kind"] } },
  ]);
  const back = portableTextToLayout(layoutToPortableText(source).body);
  expect(back?.converted).toBe(3);
  expect(back?.layout.root.children.map((n) => [n.type, n.props])).toEqual([
    ["heading", { text: "About", level: 2 }],
    ["text", { text: "We make things." }],
    ["list", { ordered: false, items: ["Fast", "Kind"] }],
  ]);
});
