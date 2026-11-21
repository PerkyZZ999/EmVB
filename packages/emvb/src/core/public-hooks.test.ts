import { describe, expect, test } from "bun:test";
import { ELEMENTS, defaultElement, type ElementType } from "./elements/index.ts";
import { emptyDesign, renderPage, type Layout } from "./index.ts";
import { editorAttributesIn } from "./public-attributes.ts";

/** Props that turn on each element's optional public hook. */
const HOOK_PROPS: Partial<Record<ElementType, Record<string, unknown>>> = {
  alert: { dismissible: true },
  gallery: { lightbox: true },
  carousel: { arrows: true, dots: true, autoplay: true, loop: true },
  counter: { countUp: true },
  headline: { rotating: true, rotate: ["fast", "light"] },
  "share-buttons": { nativeShare: true },
  map: { address: "1 Main Street", embed: true },
};

describe("public data-emvb hooks cover every element (W-1083)", () => {
  test("a public page of every element, hooks on, carries only listed hooks", () => {
    const children = (Object.keys(ELEMENTS) as ElementType[]).map((type, i) => {
      const node = defaultElement(type, `n${String(i).padStart(7, "0")}`) as {
        props: Record<string, unknown>;
      };
      Object.assign(node.props, HOOK_PROPS[type]);
      return node;
    });
    // W-1070: Hide while scrolling down marks the element for the sticky script.
    children.push({
      id: "stick001",
      type: "container",
      props: {},
      style: {
        position: "sticky",
        top: { value: 0, unit: "px" },
        motion: { sticky: { hide: true } },
      },
      children: [],
    } as never);
    const layout = {
      schemaVersion: 18,
      root: { id: "root0001", type: "container", props: {}, children },
    } as Layout;
    const { html, runtimes } = renderPage(layout, emptyDesign());
    expect(runtimes).toContain("theme");
    expect(runtimes).toContain("sticky");
    for (const hook of ["theme-toggle", "sticky-hide", "map", "rotate", "share-list", "lightbox"])
      expect(html).toContain(`data-emvb-${hook}`);
    expect(editorAttributesIn(html)).toEqual([]);
  });
});
