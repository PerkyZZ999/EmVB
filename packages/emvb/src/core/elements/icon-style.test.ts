import { describe, expect, test } from "bun:test";
import {
  emptyDesign,
  iconHasAdjustableStroke,
  iconHasOwnColors,
  IconNode,
  renderPage,
  StyleProps,
  type Layout,
  type LayoutNode,
} from "../index.ts";
import { defaultElement } from "./index.ts";

// W-237: Icon style. Glyph keys become custom properties on the wrapper; the Icon's base CSS
// applies them to its svg, so they work in states, devices and classes without runtime JS.

const design = emptyDesign();
const page = (node: LayoutNode) => {
  const layout: Layout = {
    schemaVersion: 12,
    root: { id: "root0001", type: "container", props: {}, children: [node] },
  };
  return renderPage(layout, design);
};
const icon = (extra: Partial<LayoutNode> = {}, props: Record<string, unknown> = {}) =>
  ({
    ...defaultElement("icon", "icon0001"),
    ...extra,
    props: { iconId: "star", title: "Star", ...props },
  }) as LayoutNode;
const svgOf = (html: string) => {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.querySelector(".emvb-icon svg");
};

describe("icon style keys (W-237)", () => {
  test("rotate, flip, scale, stroke, shadow and animation emit on the wrapper", () => {
    const { css } = page(
      icon({
        style: {
          iconRotate: 45,
          iconFlip: "horizontal",
          iconScale: 1.25,
          iconStrokeWidth: 1.5,
          iconShadow: { x: 0, y: 2, blur: 4, color: "#00000040" },
          iconAnimation: { type: "spin", duration: 2000 },
        },
      }),
    );
    const rule = /\.emvb-e-icon0001\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toContain("--emvb-icon-rotate:45deg");
    expect(rule).toContain("--emvb-icon-flip:-1 1");
    expect(rule).toContain("scale:1.25");
    expect(rule).toContain("--emvb-icon-stroke:1.5");
    expect(rule).toContain("--emvb-icon-shadow:drop-shadow(0px 2px 4px #00000040)");
    expect(rule).toContain("--emvb-icon-animation:emvb-icon-spin 2000ms linear infinite");
  });

  test("each flip maps to the svg's scale, and none undoes a flip", () => {
    const flips = { none: "1 1", horizontal: "-1 1", vertical: "1 -1", both: "-1 -1" } as const;
    for (const [flip, scale] of Object.entries(flips)) {
      const { css } = page(icon({ style: { iconFlip: flip as keyof typeof flips } }));
      expect(css).toContain(`--emvb-icon-flip:${scale}`);
    }
  });

  test("a shadow without colour uses the icon's colour; pulse alternates", () => {
    const { css } = page(
      icon({
        style: {
          iconShadow: { x: 1, y: 1, blur: 0 },
          iconAnimation: { type: "pulse", duration: 800 },
        },
      }),
    );
    expect(css).toContain("--emvb-icon-shadow:drop-shadow(1px 1px 0px)");
    expect(css).toContain(
      "--emvb-icon-animation:emvb-icon-pulse 800ms ease-in-out infinite alternate",
    );
  });

  test("hover and tablet set the same custom properties, so the glyph changes there", () => {
    const { css } = page(
      icon({
        style: { iconRotate: 0, transition: { property: "all", duration: 300, easing: "ease" } },
        states: { hover: { iconRotate: 90, iconScale: 1.2, color: "#ff0000" } },
        devices: { tablet: { iconFlip: "vertical" }, mobile: { iconScale: 0.8 } },
      }),
    );
    expect(css).toMatch(/\.emvb-e-icon0001:hover\{[^}]*--emvb-icon-rotate:90deg/);
    expect(css).toMatch(/\.emvb-e-icon0001:hover\{[^}]*scale:1\.2/);
    expect(css).toMatch(/@media[^{]*\{\.emvb-e-icon0001\{--emvb-icon-flip:1 -1\}/);
    expect(css).toMatch(/\.emvb-e-icon0001\{scale:0\.8\}/);
  });

  test("out-of-range or malformed values are refused by the schema and dropped by the CSS", () => {
    for (const bad of [
      { iconRotate: 361 },
      { iconRotate: 1.5 },
      { iconFlip: "diagonal" },
      { iconScale: 0 },
      { iconStrokeWidth: 7 },
      { iconShadow: { x: 0, y: 0, blur: -1 } },
      { iconShadow: { x: 0, y: 0, blur: 1, color: "red;}" } },
      { iconAnimation: { type: "wobble", duration: 1000 } },
      { iconAnimation: { type: "spin", duration: 50 } },
    ]) {
      expect(StyleProps.safeParse(bad).success).toBe(false);
      const { css } = page(icon({ style: bad as never }));
      expect(css).not.toMatch(/\.emvb-e-icon0001\{/);
    }
  });

  test("animation is Normal only: a hover animation is dropped", () => {
    const { css } = page(
      icon({ states: { hover: { iconAnimation: { type: "spin", duration: 1000 } } as never } }),
    );
    expect(css).not.toMatch(/:hover\{[^}]*--emvb-icon-animation/);
    expect(css).not.toContain("--emvb-icon-animation:emvb");
  });

  test("the base CSS applies the properties to the svg, with keyframes and reduced motion", () => {
    const { css } = page(icon());
    const svgRule = /\.emvb-icon svg\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(svgRule).toContain("rotate:var(--emvb-icon-rotate,0deg)");
    expect(svgRule).toContain("scale:var(--emvb-icon-flip,1 1)");
    expect(svgRule).toContain("filter:var(--emvb-icon-shadow,none)");
    expect(svgRule).toContain("animation:var(--emvb-icon-animation,none)");
    expect(svgRule).toContain("transition:inherit");
    expect(css).toContain(".emvb-icon-sw2{stroke-width:var(--emvb-icon-stroke,2)}");
    expect(css).toContain(".emvb-icon-sw1_5{stroke-width:var(--emvb-icon-stroke,1.5)}");
    expect(css).toContain("@keyframes emvb-icon-spin{to{transform:rotate(360deg)}}");
    expect(css).toContain(
      "@media (prefers-reduced-motion: reduce){.emvb-icon svg{animation:none}}",
    );
  });
});

describe("icon stroke width (W-237)", () => {
  test("a bundled icon moves stroke-width 2 into a class, linked or not", () => {
    const plain = svgOf(page(icon()).html);
    expect(plain?.getAttribute("stroke-width")).toBeNull();
    expect(plain?.getAttribute("class")).toBe("emvb-icon-sw2");
    const linked = svgOf(page(icon({}, { href: "/go" })).html);
    expect(linked?.getAttribute("stroke-width")).toBeNull();
    expect(linked?.getAttribute("class")).toBe("emvb-icon-sw2");
  });

  test("a picked stroke icon keeps its own width as the fallback", () => {
    const svg =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h16"/></svg>';
    const el = svgOf(page(icon({}, { iconId: "tabler:minus", iconSvg: svg })).html);
    expect(el?.getAttribute("stroke-width")).toBeNull();
    expect(el?.getAttribute("class")).toBe("emvb-icon-sw1_5");
    expect(iconHasAdjustableStroke(svg)).toBe(true);
  });

  test("fill icons and unusual widths are left alone and offer no Stroke width", () => {
    const fill = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M0 0h24v24H0z"/></svg>';
    expect(
      svgOf(page(icon({}, { iconId: "fa-solid:square", iconSvg: fill })).html)?.getAttribute(
        "class",
      ),
    ).toBeNull();
    expect(iconHasAdjustableStroke(fill)).toBe(false);
    const odd =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 4h16"/></svg>';
    expect(
      svgOf(page(icon({}, { iconId: "x:odd", iconSvg: odd })).html)?.getAttribute("stroke-width"),
    ).toBe("1.75");
    expect(iconHasAdjustableStroke(odd)).toBe(false);
    expect(iconHasAdjustableStroke(undefined)).toBe(true);
  });
});

describe("force single colour (W-238)", () => {
  const multi =
    '<svg viewBox="0 0 24 24"><defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient></defs><circle cx="12" cy="12" r="10" fill="url(#g)"/><path d="M0 0h4" stroke="#0a0" fill="none"/><rect width="4" height="4"/></svg>';
  const paints = (html: string) => {
    const svg = svgOf(html);
    return [svg, ...(svg?.querySelectorAll("*") ?? [])].map((el) =>
      ["fill", "stroke", "stop-color"].map((name) => el?.getAttribute(name)).join("|"),
    );
  };

  test("off: a multi-colour upload keeps its colours", () => {
    const html = page(icon({}, { iconId: "upload:m1", iconSvg: multi })).html;
    expect(paints(html)).toEqual([
      "||",
      "||",
      "||",
      "||#f00",
      "||#00f",
      "url(#g)||",
      "none|#0a0|",
      "||",
    ]);
  });

  test("on: every fill, stroke and stop is the icon colour; none stays none", () => {
    const html = page(icon({}, { iconId: "upload:m1", iconSvg: multi, singleColor: true })).html;
    expect(paints(html)).toEqual([
      "currentColor||",
      "||",
      "||",
      "||currentColor",
      "||currentColor",
      "currentColor||",
      "none|currentColor|",
      "||",
    ]);
  });

  test("a bundled icon ignores it and the schema takes only a boolean", () => {
    const html = page(icon({}, { singleColor: true })).html;
    expect(svgOf(html)?.getAttribute("fill")).toBe("none");
    expect(svgOf(html)?.getAttribute("stroke")).toBe("currentColor");
    const node = icon({}, { singleColor: true });
    expect(IconNode.safeParse(node).success).toBe(true);
    expect(IconNode.safeParse(icon({}, { singleColor: "yes" })).success).toBe(false);
  });

  test("Force single colour is offered only for SVGs with their own colours", () => {
    expect(iconHasOwnColors(multi)).toBe(true);
    expect(iconHasOwnColors('<svg viewBox="0 0 24 24"><path d="M0 0h1"/></svg>')).toBe(true);
    expect(
      iconHasOwnColors('<svg viewBox="0 0 24 24" fill="currentColor"><path d="M0 0h1"/></svg>'),
    ).toBe(false);
    expect(
      iconHasOwnColors(
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M0 0h1"/></svg>',
      ),
    ).toBe(false);
    expect(iconHasOwnColors(undefined)).toBe(false);
  });
});
