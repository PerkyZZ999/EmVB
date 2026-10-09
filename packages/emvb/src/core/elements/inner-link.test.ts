import { describe, expect, test } from "bun:test";
import {
  ELEMENT_DESCRIPTORS,
  emptyDesign,
  renderPage,
  type Layout,
  type LayoutNode,
} from "../index.ts";
import { IconNode } from "../schema/layout.ts";
import { defaultElement } from "./index.ts";

const design = emptyDesign();
const page = (...children: LayoutNode[]): Layout => ({
  schemaVersion: 13,
  root: { id: "root0001", type: "container", props: {}, children },
});
const html = (...children: LayoutNode[]) => renderPage(page(...children), design).html;
const heading = (props: Record<string, unknown>) =>
  ({
    ...defaultElement("heading", "head0001"),
    props: { text: "Plans", level: 2, ...props },
  }) as LayoutNode;
const icon = (props: Record<string, unknown>) =>
  ({ ...defaultElement("icon", "icon0001"), props: { iconId: "star", ...props } }) as LayoutNode;

describe("Heading and Icon take a link (W-141)", () => {
  test("a linked heading keeps its tag and wraps the text in a link", () => {
    expect(html(heading({ href: "/pricing" }))).toContain(
      '<h2 class="emvb-heading"><a class="emvb-heading-link" href="/pricing">Plans</a></h2>',
    );
    expect(html(heading({ href: "https://example.com", newTab: true }))).toContain(
      '<a class="emvb-heading-link" href="https://example.com" target="_blank" rel="noopener noreferrer">Plans</a>',
    );
  });

  test("no link, an empty link or a refused link leaves the plain heading", () => {
    for (const href of [undefined, "", "   ", "javascript:alert(1)"]) {
      expect(html(heading({ href }))).toContain('<h2 class="emvb-heading">Plans</h2>');
    }
  });

  test("a linked icon is named by its title on the link and hides its svg", () => {
    const doc = new DOMParser().parseFromString(
      html(icon({ title: "Home", href: "/", newTab: true })),
      "text/html",
    );
    const link = doc.querySelector(".emvb-icon > a.emvb-icon-link");
    expect(link?.getAttribute("href")).toBe("/");
    expect(link?.getAttribute("aria-label")).toBe("Home");
    expect(link?.getAttribute("target")).toBe("_blank");
    const svg = link?.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.hasAttribute("role")).toBe(false);
    expect(svg?.hasAttribute("aria-label")).toBe(false);
  });

  test("an icon without a link, or with a refused one, renders as before", () => {
    for (const href of [undefined, "javascript:alert(1)"]) {
      const doc = new DOMParser().parseFromString(html(icon({ title: "Home", href })), "text/html");
      expect(doc.querySelector(".emvb-icon a")).toBeNull();
      expect(doc.querySelector(".emvb-icon > svg")?.getAttribute("aria-label")).toBe("Home");
    }
  });

  test("a linked icon needs a title, even when decorative", () => {
    expect(IconNode.safeParse(icon({ title: "Home", href: "/" })).success).toBe(true);
    const untitled = IconNode.safeParse(icon({ decorative: true, href: "/" }));
    expect(untitled.success).toBe(false);
    expect(JSON.stringify(untitled.error?.issues)).toContain("A linked icon needs a title");
    expect(IconNode.safeParse(icon({ decorative: true })).success).toBe(true);
    expect(IconNode.safeParse(icon({ decorative: true, href: "" })).success).toBe(true);
  });

  test("a linked heading or icon keeps a box link from nesting anchors", () => {
    for (const child of [heading({ href: "/a" }), icon({ title: "Home", href: "/a" })]) {
      const box = {
        id: "boxx0001",
        type: "div-block",
        props: { href: "/box" },
        children: [child],
      } as LayoutNode;
      const out = html(box);
      expect(out).not.toContain('href="/box"');
      expect(out.match(/<a /g)?.length).toBe(1);
    }
    const plain = {
      id: "boxx0001",
      type: "div-block",
      props: { href: "/box" },
      children: [heading({})],
    } as LayoutNode;
    expect(html(plain)).toContain('href="/box"');
  });
});

describe("every Link field is checked as a link (W-176)", () => {
  test("a box's Link, like every other href, is an href field with the URL message", () => {
    const links = ELEMENT_DESCRIPTORS.flatMap((d) =>
      d.fields.filter((f) => f.key === "href").map((f) => `${d.type}:${f.kind}:${f.message}`),
    );
    const message = "Use a full URL such as https://example.com or a path such as /pricing.";
    for (const type of ["container", "div-block", "flexbox", "grid"]) {
      expect(links).toContain(`${type}:href:${message}`);
    }
    expect(links.filter((entry) => !entry.includes(":href:"))).toEqual([]);
  });
});
