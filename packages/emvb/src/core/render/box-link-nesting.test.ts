import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { renderPage } from "./index.ts";

const inLinkedBox = (child: unknown) =>
  renderPage(
    {
      schemaVersion: 18,
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
    ["Loop Item part", { id: "loop0001", type: "loop", props: { partId: "card" }, children: [] }],
    // W-1073, W-1067: a form with a field and a button, and a button.
    ["Search form", { id: "srch0001", type: "search-form", props: {} }],
    ["Theme toggle", { id: "thme0001", type: "theme-toggle", props: {} }],
    // Widgets with a button or link of their own, some only once their link is set.
    ["Countdown", { id: "cdwn0001", type: "countdown", props: { target: "2027-01-01T00:00Z" } }],
    ["Map", { id: "map00001", type: "map", props: { address: "Paris" } }],
    [
      "Social icons",
      {
        id: "soci0001",
        type: "social-icons",
        props: {},
        children: [
          { id: "socl0001", type: "social-link", props: { network: "x", href: "https://x.com/a" } },
        ],
      },
    ],
    ["Share link", { id: "shar0001", type: "share-link", props: { network: "x" } }],
    ["Hotspot", { id: "hots0001", type: "hotspot", props: { title: "P", x: 1, y: 1 } }],
    ["linked CTA", { id: "cta00001", type: "cta", props: { title: "T", href: "/go" } }],
    [
      "linked Price table",
      { id: "prct0001", type: "price-table", props: { title: "P", price: "1", buttonHref: "/b" } },
    ],
    [
      "linked Icon box",
      { id: "icbx0001", type: "icon-box", props: { title: "T", text: "", href: "/i" } },
    ],
    [
      "dismissible Alert",
      { id: "alrt0001", type: "alert", props: { variant: "info", text: "A", dismissible: true } },
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
