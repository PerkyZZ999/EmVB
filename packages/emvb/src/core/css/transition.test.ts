import { describe, expect, test } from "bun:test";
import { renderPage } from "../render/index.ts";
import { DESIGN_SCHEMA_VERSION, type DesignSystem } from "../schema/design.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout, type LayoutNode } from "../schema/layout.ts";
import { StyleProps, StyleStates } from "../schema/style.ts";
import { styleDeclarations } from "../sanitize/css.ts";

const design = (classes: DesignSystem["classes"] = []): DesignSystem => ({
  schemaVersion: DESIGN_SCHEMA_VERSION,
  variables: { colors: [], fonts: [], fontSizes: [], spacings: [] },
  classes,
});

const page = (...children: LayoutNode[]): Layout => ({
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: { id: "root0001", type: "container", props: {}, children },
});

const button = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, type: "button", props: { text: "Go", href: "/go" }, ...extra }) as LayoutNode;

const fade = { duration: 250, easing: "ease-out", property: "opacity" } as const;

describe("transition (W-089)", () => {
  test.each([
    [{ duration: 200, easing: "ease", property: "all" }, "all 200ms ease"],
    [
      { duration: 150, easing: "linear", property: "colors", delay: 50 },
      "color 150ms linear 50ms,background-color 150ms linear 50ms,border-color 150ms linear 50ms",
    ],
    [{ duration: 0, easing: "ease-in", property: "opacity" }, "opacity 0ms ease-in"],
    [
      { duration: 2000, easing: "ease-in-out", property: "shadow" },
      "box-shadow 2000ms ease-in-out",
    ],
    [
      { duration: 300, easing: "ease-out", property: "filter", delay: 0 },
      "filter 300ms ease-out 0ms",
    ],
  ])("%j becomes transition: %s", (transition, css) => {
    expect(StyleProps.safeParse({ transition }).success).toBe(true);
    expect(styleDeclarations({ transition })).toEqual({
      declarations: [{ property: "transition", value: css }],
      rejected: [],
    });
  });

  test.each([
    { duration: 2001, easing: "ease", property: "all" },
    { duration: -1, easing: "ease", property: "all" },
    { duration: 1.5, easing: "ease", property: "all" },
    { duration: 200, delay: 2001, easing: "ease", property: "all" },
    { duration: 200, easing: "steps(2)", property: "all" },
    { duration: 200, easing: "cubic-bezier(0,0,1,1)", property: "all" },
    { duration: 200, easing: "ease", property: "width" },
    { duration: 200, easing: "ease", property: "all;}body{x:y" },
    { duration: 200, easing: "ease", property: "toString" },
    { duration: 200, easing: "ease", property: "all", extra: 1 },
    { easing: "ease", property: "all" },
    "all 200ms ease",
  ])("%j is refused by the schema and dropped by the generator", (transition) => {
    expect(StyleProps.safeParse({ transition }).success).toBe(false);
    expect(styleDeclarations({ transition })).toEqual({
      declarations: [],
      rejected: ["transition"],
    });
  });

  test("transitions are Normal only: refused in a state, and dropped with a warning if forged", () => {
    expect(StyleStates.safeParse({ hover: { transition: fade } }).success).toBe(false);
    const result = renderPage(
      page(button("btn00001", { states: { hover: { opacity: 0.5, transition: fade } } })),
      design(),
    );
    expect(result.css).toContain(".emvb-e-btn00001:hover{opacity:0.5}");
    expect(result.css).not.toContain("transition");
    expect(result.warnings).toContainEqual({
      nodeId: "btn00001",
      code: "rejected-style",
      detail: "hover.transition",
    });
  });

  test("the transition sits on the base rule, and reduced motion turns off exactly those rules", () => {
    const css = renderPage(
      page(
        button("btn00001", { style: { transition: fade }, states: { hover: { opacity: 0.5 } } }),
        button("btn00002", { style: { opacity: 0.9 } }),
        button("btn00003", { classes: ["card"] }),
      ),
      design([
        { id: "card", name: "Card", style: { transition: { ...fade, property: "colors" } } },
        { id: "plain", name: "Plain", style: { opacity: 0.8 } },
      ]),
    ).css;
    expect(css).toContain(".emvb-e-btn00001{transition:opacity 250ms ease-out}");
    expect(css).toContain(".emvb-k-card{transition:color 250ms ease-out,");
    expect(
      css.endsWith(
        "@media (prefers-reduced-motion: reduce){.emvb-k-card,.emvb-e-btn00001{transition:none}}",
      ),
    ).toBe(true);
  });

  test("no transitions, no reduced-motion block", () => {
    const css = renderPage(page(button("btn00001", { style: { opacity: 0.9 } })), design()).css;
    expect(css).not.toContain("prefers-reduced-motion");
  });
});
