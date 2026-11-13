import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, validateLayout, type LayoutNode } from "../index.ts";

const page = (...children: unknown[]) =>
  validateLayout({
    schemaVersion: 18,
    root: { id: "root0001", type: "container", props: {}, children },
  });

function render(...children: unknown[]) {
  const result = page(...children);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return renderPage(result.layout, emptyDesign()).html;
}

const rating = (props: Record<string, unknown>, extra: Partial<LayoutNode> = {}) => ({
  id: "rate0001",
  type: "rating",
  props,
  ...extra,
});

describe("Star rating (W-1023)", () => {
  test("names the rating for screen readers and hides the stars", () => {
    const html = render(rating({ value: 4.5 }));
    expect(html).toContain('role="img" aria-label="Rated 4.5 out of 5"');
    expect(html.match(/class="emvb-rating-star"/g)).toHaveLength(5);
    expect(html.match(/<svg [^>]*aria-hidden="true"/g)?.length).toBe(10);
  });

  test("full stars are whole, the half star is cut by its viewBox, empty ones have no fill", () => {
    const html = render(rating({ value: 2.5, max: 4, size: 20 }));
    const fills = [
      ...html.matchAll(
        /class="emvb-rating-fill" width="([\d.]+)" height="20" viewBox="0 0 ([\d.]+) 24"/g,
      ),
    ];
    expect(fills.map((m) => [m[1], m[2]])).toEqual([
      ["20", "24"],
      ["20", "24"],
      ["10", "12"],
    ]);
    expect(html.match(/class="emvb-rating-empty"/g)).toHaveLength(4);
  });

  test("the label template fills in the value and the number of stars", () => {
    expect(render(rating({ value: 3, max: 10, label: "{value}/{max} stars" }))).toContain(
      'aria-label="3/10 stars"',
    );
    expect(render(rating({ value: 4.25 }))).toContain('aria-label="Rated 4.3 out of 5"');
  });

  test("a value above the number of stars shows as full stars; bad numbers are refused", () => {
    expect(render(rating({ value: 6 }))).toContain('aria-label="Rated 5 out of 5"');
    expect(page(rating({ value: 1, max: 2.5 })).ok).toBe(false);
    expect(page(rating({ value: -1 })).ok).toBe(false);
    expect(page(rating({ value: 4, max: 11 })).ok).toBe(false);
    expect(page(rating({ value: 11 })).ok).toBe(false);
  });

  test("right to left, the part-filled star fills from the right", () => {
    const result = page(rating({ value: 1.5, max: 2 }, { dir: "rtl" } as Partial<LayoutNode>));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { html, css } = renderPage(result.layout, emptyDesign());
    expect(html).toContain('dir="rtl"');
    expect(css).toContain(
      ".emvb-rating[dir=rtl] .emvb-rating-fill{left:auto;right:0;transform:scaleX(-1)}",
    );
  });
});
