import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, validateLayout, type Layout } from "../index.ts";

const page = (sticky: unknown, extra: Record<string, unknown> = {}): Layout =>
  ({
    schemaVersion: 18,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        {
          id: "head0001",
          type: "container",
          props: {},
          style: {
            position: "sticky",
            top: { value: 0, unit: "px" },
            motion: { sticky, ...extra },
          },
          children: [],
        },
      ],
    },
  }) as unknown as Layout;
const render = (layout: Layout) => renderPage(layout, emptyDesign());

describe("sticky header effects (W-1070)", () => {
  test("background, shadow and padding run over the first scroll pixels of the page", () => {
    const { css, runtimes, html } = render(
      page({
        background: "#112233",
        shadow: true,
        padding: { value: 6, unit: "px" },
        distance: 80,
      }),
    );
    expect(css).toContain(
      "animation:emvb-sticky-bg linear both, emvb-sticky-shadow linear both, emvb-sticky-pad linear both;animation-timeline:scroll(root), scroll(root), scroll(root);animation-range:0px 80px, 0px 80px, 0px 80px;--emvb-sticky-bg:#112233;--emvb-sticky-pad:6px",
    );
    expect(css).toContain("@supports (animation-timeline: scroll()){@keyframes emvb-sticky-bg");
    expect(css).toContain("@keyframes emvb-sticky-pad");
    // Reduced motion stops it, as every animation.
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(runtimes).toEqual([]);
    expect(html.includes("data-emvb-sticky-hide")).toBe(false);
  });

  test("unset distance is 120 px; the keyframes are sent only to pages that use them", () => {
    expect(render(page({ shadow: true })).css).toContain("animation-range:0px 120px");
    const plain = render(page(undefined)).css;
    expect(plain.includes("emvb-sticky")).toBe(false);
  });

  test("hide marks the element and asks for the sticky script, with no CSS of its own", () => {
    const { html, css, runtimes } = render(page({ hide: true }));
    expect(html).toContain("data-emvb-sticky-hide");
    expect(runtimes).toEqual(["sticky"]);
    expect(css.includes("emvb-sticky-")).toBe(false);
  });

  test("an entrance on the same element keeps playing alongside", () => {
    const { css } = render(page({ shadow: true }, { entrance: { type: "fade", duration: 400 } }));
    expect(css).toMatch(/animation:emvb-fade [^;]*, emvb-sticky-shadow linear both/);
  });

  test("the schema wants at least one effect and a distance from 10 to 2000 px", () => {
    expect(validateLayout(page({})).ok).toBe(false);
    expect(validateLayout(page({ distance: 120 })).ok).toBe(false);
    expect(validateLayout(page({ shadow: true, distance: 5 })).ok).toBe(false);
    expect(validateLayout(page({ type: "none" })).ok).toBe(true);
    expect(validateLayout(page({ hide: true })).ok).toBe(true);
  });
});
