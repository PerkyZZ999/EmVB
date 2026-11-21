import { describe, expect, test } from "bun:test";
import {
  emptyDesign,
  renderPage,
  type DesignSystem,
  type Layout,
  type LayoutNode,
} from "../index.ts";

const px = (value: number) => ({ value, unit: "px" as const });

const spacer = (extra: Record<string, unknown> = {}): LayoutNode =>
  ({ id: "spac0001", type: "spacer", props: { height: px(96) }, ...extra }) as LayoutNode;

const page = (parent: Record<string, unknown>, child: LayoutNode): Layout =>
  ({
    schemaVersion: 18,
    root: { id: "root0001", type: "container", props: {}, ...parent, children: [child] },
  }) as Layout;

/** The Spacer's rule at each level: desktop first, then each media query that holds it. */
const spacerRules = (css: string) =>
  [...css.matchAll(/\.emvb-e-spac0001\{([^}]*)\}/g)].map((m) => m[1] ?? "");

describe("a Spacer's flex-basis follows its parent's direction (W-1062)", () => {
  test("in a column it has no basis, so a device's own height applies", () => {
    const { css } = renderPage(
      page({}, spacer({ devices: { mobile: { height: px(8) } } })),
      emptyDesign(),
    );
    expect(css.includes("flex-basis")).toBe(false);
    expect(spacerRules(css)).toEqual(["height:96px", "height:8px"]);
  });

  test("in a row the basis is the height, per device", () => {
    const { css } = renderPage(
      page({ style: { flexDirection: "row" } }, spacer({ devices: { mobile: { height: px(8) } } })),
      emptyDesign(),
    );
    expect(spacerRules(css)).toEqual(["height:96px;flex-basis:96px", "height:8px;flex-basis:8px"]);
  });

  test("a row that becomes a column on mobile drops the basis there", () => {
    const { css } = renderPage(
      page(
        { style: { flexDirection: "row" }, devices: { mobile: { flexDirection: "column" } } },
        spacer({ devices: { tablet: { height: px(40) } } }),
      ),
      emptyDesign(),
    );
    expect(spacerRules(css)).toEqual([
      "height:96px;flex-basis:96px",
      "height:40px;flex-basis:40px",
      "flex-basis:auto",
    ]);
  });

  test("a column that becomes a row on tablet gets the basis there", () => {
    const { css } = renderPage(
      page({ devices: { tablet: { flexDirection: "row" } } }, spacer()),
      emptyDesign(),
    );
    expect(spacerRules(css)).toEqual(["height:96px", "flex-basis:96px"]);
  });

  test("its own width on a device wins over the basis there", () => {
    const { css } = renderPage(
      page({ style: { flexDirection: "row" } }, spacer({ devices: { mobile: { width: px(4) } } })),
      emptyDesign(),
    );
    expect(spacerRules(css)).toEqual(["height:96px;flex-basis:96px", "width:4px;flex-basis:auto"]);
  });

  test("its own basis is never overridden", () => {
    const { css } = renderPage(
      page(
        { style: { flexDirection: "row" } },
        spacer({ devices: { tablet: { flexBasis: px(10) } } }),
      ),
      emptyDesign(),
    );
    expect(spacerRules(css)).toEqual(["height:96px;flex-basis:96px", "flex-basis:10px"]);
  });

  test("a Flexbox is a row by default; a class can make a container a row", () => {
    const flexbox: Layout = {
      schemaVersion: 18,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "flex0001", type: "flexbox", props: {}, children: [spacer()] } as LayoutNode,
        ],
      },
    };
    expect(spacerRules(renderPage(flexbox, emptyDesign()).css)).toEqual([
      "height:96px;flex-basis:96px",
    ]);
    const design: DesignSystem = {
      ...emptyDesign(),
      classes: [{ id: "row", name: "Row", style: { flexDirection: "row" } }],
    };
    const { css } = renderPage(page({ classes: ["row"] }, spacer()), design);
    expect(spacerRules(css)).toEqual(["height:96px;flex-basis:96px"]);
  });
});
