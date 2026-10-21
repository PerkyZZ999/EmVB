import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, type Layout } from "../index.ts";

const render = (grid: Record<string, unknown>, child: Record<string, unknown>) =>
  renderPage(
    {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "grid0001",
            type: "grid",
            ...grid,
            children: [{ id: "kid00001", type: "text", props: { text: "k" }, ...child }],
          },
        ],
      },
    } as unknown as Layout,
    emptyDesign(),
  ).css;

/** The kid's grid-column in the base rule and in each device query, in order. */
const placements = (css: string) =>
  [...css.matchAll(/\.emvb-e-kid00001\{[^}]*?grid-column:([^;}]+)/g)].map((m) => m[1]);

describe("W-799 grid placement fits each device's columns", () => {
  test("span 3 in a grid of 1 column on phones is span 1 there, span 3 elsewhere", () => {
    const css = render(
      { props: { columns: 3, columnsMobile: 1 } },
      { style: { gridColumnSpan: 3 } },
    );
    expect(placements(css)).toEqual(["span 3", "span 3", "span 1"]);
  });
  test("a start line past the phone grid is dropped there", () => {
    const css = render(
      { props: { columns: 4, columnsMobile: 2 } },
      { style: { gridColumnStart: 4 } },
    );
    expect(placements(css)).toEqual(["4", "4", "auto"]);
  });
  test("custom tracks count as columns, and a span wider than the desktop grid is capped", () => {
    const css = render(
      { props: { columns: 2, columnTracksTablet: ["1fr", "1fr", "1fr", "1fr"] } },
      { style: { gridColumnSpan: 4 } },
    );
    expect(placements(css)).toEqual(["span 2", "span 4", "span 4"]);
  });
  test("a placement that fits everywhere adds no device rules", () => {
    const css = render(
      { props: { columns: 3, columnsMobile: 2 } },
      { style: { gridColumnSpan: 2 } },
    );
    expect(placements(css)).toEqual(["span 2"]);
  });
});
