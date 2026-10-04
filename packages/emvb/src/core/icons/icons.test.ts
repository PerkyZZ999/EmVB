import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import { renderPage } from "../render/index.ts";
import { defaultElement } from "../elements/index.ts";
import { BUNDLED_ICON_IDS, BUNDLED_ICONS, getBundledIcon } from "./catalog.ts";
import type { Layout } from "../schema/layout.ts";

const page = (node: ReturnType<typeof defaultElement>): Layout => ({
  schemaVersion: 10,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [node as never],
  },
});

describe("bundled icons (W-025, A-04)", () => {
  test("every bundled icon inlines as SVG with allowlisted primitives", () => {
    expect(BUNDLED_ICONS.length).toBeGreaterThan(10);
    for (const id of BUNDLED_ICON_IDS) {
      const node = {
        ...defaultElement("icon", "icon0001"),
        props: { iconId: id, title: id, decorative: false, size: 24 },
      };
      const { html } = renderPage(page(node), emptyDesign());
      expect(html).toContain("<svg");
      expect(html).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(html).toContain("</svg>");
      expect(getBundledIcon(id)?.children.length).toBeGreaterThan(0);
    }
  });

  test("unknown icon ids render a placeholder, never raw HTML or a remote URL", () => {
    const evil = {
      ...defaultElement("icon", "icon0002"),
      props: {
        iconId: "<script>alert(1)</script>",
        title: "x",
        decorative: false,
      },
    };
    const { html } = renderPage(page(evil), emptyDesign());
    const dom = new DOMParser().parseFromString(html, "text/html");
    expect(dom.querySelector("script")?.outerHTML ?? null).toBeNull();
    expect(dom.querySelector("img")?.outerHTML ?? null).toBeNull();
    expect(html).toContain("emvb-icon-missing");

    const remote = {
      ...defaultElement("icon", "icon0003"),
      props: {
        iconId: "https://evil.example/icon.svg",
        title: "Remote",
        decorative: false,
      },
    };
    const remoteHtml = renderPage(page(remote), emptyDesign()).html;
    const remoteDom = new DOMParser().parseFromString(remoteHtml, "text/html");
    expect(remoteDom.querySelector("img")?.outerHTML ?? null).toBeNull();
    expect(remoteHtml).not.toContain("https://evil.example");
    expect(remoteHtml).toContain("emvb-icon-missing");
  });

  test("decorative icons are aria-hidden; titled icons expose an accessible name", () => {
    const decorative = {
      ...defaultElement("icon", "icon0004"),
      props: { iconId: "star", decorative: true, title: "ignored" },
    };
    const titled = {
      ...defaultElement("icon", "icon0005"),
      props: { iconId: "star", decorative: false, title: "Favourite" },
    };
    expect(renderPage(page(decorative), emptyDesign()).html).toContain('aria-hidden="true"');
    expect(renderPage(page(titled), emptyDesign()).html).toContain('aria-label="Favourite"');
  });
});
