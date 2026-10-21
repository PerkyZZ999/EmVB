import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { renderPage } from "./index.ts";

const inLinkedBox = (child: unknown) =>
  renderPage(
    {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "box00001", type: "container", props: { href: "/card" }, children: [child] },
        ],
      },
    } as Layout,
    emptyDesign(),
  ).html;

describe("W-668: a linked box never wraps links, controls or embeds", () => {
  const cases: [string, LayoutNode][] = [
    [
      "linked image",
      { id: "img00001", type: "image", props: { src: "/a.png", alt: "A", href: "/y" } },
    ],
    [
      "menu",
      {
        id: "menu0001",
        type: "menu",
        props: {},
        children: [
          { id: "mi000001", type: "menu-item", props: { text: "A", href: "/a" }, children: [] },
        ],
      },
    ],
    [
      "accordion",
      {
        id: "acc00001",
        type: "accordion",
        props: {},
        children: [
          { id: "acci0001", type: "accordion-item", props: { summary: "Q" }, children: [] },
        ],
      },
    ],
    [
      "video",
      { id: "vid00001", type: "video", props: { url: "https://youtu.be/dQw4w9WgXcQ", title: "V" } },
    ],
    [
      "Loop Item part",
      { id: "loop0001", type: "loop", props: { itemPartId: "card" }, children: [] },
    ],
  ] as never;
  for (const [name, child] of cases) {
    test(`around a ${name} it stays a box`, () => {
      expect(inLinkedBox(child)).not.toContain('<a class="emvb-container emvb-box-link"');
    });
  }

  test("plain content still makes the box the link", () => {
    const html = inLinkedBox({ id: "img00002", type: "image", props: { src: "/a.png", alt: "A" } });
    expect(html).toContain('<a class="emvb-container emvb-box-link" href="/card">');
  });
});
