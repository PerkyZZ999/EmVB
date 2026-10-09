import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import { LAYOUT_SCHEMA_VERSION, Layout, type LayoutNode } from "../schema/layout.ts";
import { StyleProps } from "../schema/style.ts";
import { styleDeclarations, stateDeclarations } from "../sanitize/css.ts";
import { renderPage } from "../render/index.ts";

const page = (extra: Partial<LayoutNode>): Layout => ({
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      {
        id: "head0001",
        type: "heading",
        props: { text: "Hello", level: 1 },
        ...extra,
      } as LayoutNode,
    ],
  },
});

const rise = {
  range: "enter" as const,
  effects: [
    { type: "fade" as const, from: 0, to: 100 },
    { type: "move-y" as const, from: 60, to: 0 },
  ],
};

const decl = (style: unknown) =>
  Object.fromEntries(styleDeclarations(style).declarations.map((d) => [d.property, d.value]));

describe("W-319 scroll motion", () => {
  test("W-319 each property gets its own animation, timeline, range and values", () => {
    expect(decl({ scrollMotion: rise })).toEqual({
      animation: "emvb-mo linear both, emvb-mt linear both",
      "animation-timeline": "view(), view()",
      "animation-range": "entry 0% entry 100%, entry 0% entry 100%",
      "--emvb-mo0": "0",
      "--emvb-mo1": "1",
      "--emvb-mt0": "0px 60px",
      "--emvb-mt1": "0px 0px",
    });
  });

  test("W-319 page range follows the root scroller", () => {
    const d = decl({
      scrollMotion: { range: "page", effects: [{ type: "rotate", from: 0, to: 360 }] },
    });
    expect(d["animation-timeline"]).toBe("scroll(root)");
    expect(d["animation-range"]).toBe("normal");
    expect(d["--emvb-mr1"]).toBe("360deg");
  });

  test("W-319 keyframes only where supported and motion is welcome", () => {
    const { css } = renderPage(page({ style: { scrollMotion: rise } }), emptyDesign());
    expect(css).toContain(
      "@media (prefers-reduced-motion: no-preference){@supports (animation-timeline: view()){@keyframes emvb-mo{from{opacity:var(--emvb-mo0)}to{opacity:var(--emvb-mo1)}}",
    );
    expect(css).toContain(
      "@media (prefers-reduced-motion: reduce){.emvb-e-head0001{animation:none}}",
    );
    const still = renderPage(
      page({ style: { entrance: { type: "fade", duration: 300 } } }),
      emptyDesign(),
    );
    expect(still.css).not.toContain("@keyframes emvb-mo");
  });

  test("W-319 an entrance and scroll motion play together", () => {
    const d = decl({
      entrance: { type: "fade", duration: 300, trigger: "view" },
      scrollMotion: { range: "cross", effects: [{ type: "scale", from: 90, to: 110 }] },
    });
    expect(d["animation"]).toBe("emvb-fade 300ms ease-out both, emvb-ms linear both");
    expect(d["animation-timeline"]).toBe("view(), view()");
    expect(d["animation-range"]).toBe("entry 0% cover 40%, cover 0% cover 100%");
    const load = decl({
      entrance: { type: "fade", duration: 300 },
      scrollMotion: { range: "exit", effects: [{ type: "blur", from: 0, to: 8 }] },
    });
    expect(load["animation-timeline"]).toBe("auto, view()");
    expect(load["animation-range"]).toBe("normal, exit 0% exit 100%");
    expect(load["--emvb-mb1"]).toBe("blur(8px)");
  });

  test("W-319 none stops motion a wider screen sets, but not an entrance", () => {
    const { css } = renderPage(
      page({
        style: { scrollMotion: rise },
        devices: { mobile: { scrollMotion: { type: "none" } } },
      }),
      emptyDesign(),
    );
    expect(css).toMatch(/@media[^{]*\{[^}]*\.emvb-e-head0001\{animation:none\}/);
    const d = decl({ entrance: { type: "fade", duration: 300 }, scrollMotion: { type: "none" } });
    expect(d["animation"]).toBe("emvb-fade 300ms ease-out both");
  });

  test("W-319 bad values are refused by the schema and dropped by the sanitizer", () => {
    const bad = [
      { range: "enter", effects: [] },
      { range: "sideways", effects: [{ type: "fade", from: 0, to: 100 }] },
      { range: "enter", effects: [{ type: "fade", from: 0, to: 300 }] },
      { range: "enter", effects: [{ type: "wobble", from: 0, to: 1 }] },
      {
        range: "enter",
        effects: [
          { type: "fade", from: 0, to: 100 },
          { type: "fade", from: 10, to: 100 },
        ],
      },
      { range: "enter", effects: [{ type: "blur", from: "1px;}", to: 0 }] },
    ];
    for (const scrollMotion of bad) {
      expect(StyleProps.safeParse({ scrollMotion }).success).toBe(false);
      const result = styleDeclarations({ scrollMotion });
      expect(result.declarations).toEqual([]);
      expect(result.rejected).toEqual(["scrollMotion"]);
    }
    expect(StyleProps.safeParse({ scrollMotion: rise }).success).toBe(true);
  });

  test("W-319 not a state style", () => {
    expect(stateDeclarations({ hover: { scrollMotion: rise } }).states.hover ?? []).toEqual([]);
    expect(
      Layout.safeParse(page({ states: { hover: { scrollMotion: rise } } as never })).success,
    ).toBe(false);
  });

  test("W-319 a smaller screen's none keeps the entrance it inherits", () => {
    const { css } = renderPage(
      page({
        style: { entrance: { type: "fade", duration: 300 }, scrollMotion: rise },
        devices: { mobile: { scrollMotion: { type: "none" } } },
      }),
      emptyDesign(),
    );
    expect(css).toMatch(/\.emvb-e-head0001\{animation:emvb-fade 300ms ease-out both\}/);
  });

  test("W-319 a smaller screen's entrance keeps the motion it inherits", () => {
    const { css } = renderPage(
      page({
        style: { scrollMotion: rise },
        devices: { tablet: { entrance: { type: "scale", duration: 200 } } },
      }),
      emptyDesign(),
    );
    expect(css).toContain("animation:emvb-scale 200ms ease-out both, emvb-mo linear both");
  });

  test("W-319 an element's motion keeps its class's entrance", () => {
    const design = {
      ...emptyDesign(),
      classes: [
        { id: "pop", name: "Pop", style: { entrance: { type: "fade" as const, duration: 250 } } },
      ],
    };
    const { css } = renderPage(page({ classes: ["pop"], style: { scrollMotion: rise } }), design);
    expect(css).toContain(".emvb-e-head0001{animation:emvb-fade 250ms ease-out both, emvb-mo");
  });
});
