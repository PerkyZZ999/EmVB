import { describe, expect, test } from "bun:test";
import { renderPage } from "../render/index.ts";
import { DesignSystem, emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { applyTokens, fluidClamp, spaceScale, typeScale } from "./tokens.ts";

const page = {
  schemaVersion: 14,
  root: { id: "root0001", type: "container", props: {}, children: [] },
} as Layout;

describe("design tokens (W-316)", () => {
  test("fluidClamp grows from min at the small screen to max at the large one", () => {
    // 16px at 360, 20px at 1280: slope 4/920, intercept 16 - 360*4/920.
    expect(fluidClamp(16, 20)).toBe("clamp(1rem, 0.9022rem + 0.4348vw, 1.25rem)");
    expect(fluidClamp(20, 20)).toBe("1.25rem");
    // A shrinking size keeps clamp's bounds in order.
    expect(fluidClamp(24, 16)).toMatch(/^clamp\(1rem, .* 1\.5rem\)$/);
    expect(fluidClamp(16, 20, { minWidth: 400, maxWidth: 1200 })).toBe(
      "clamp(1rem, 0.875rem + 0.5vw, 1.25rem)",
    );
  });

  test("a type scale has eight steps from a base and a ratio, fluid with a small base", () => {
    const fixed = typeScale({ base: 16, ratio: 1.25 });
    expect(fixed.map((t) => t.id)).toEqual([
      "fs-xs",
      "fs-s",
      "fs-m",
      "fs-l",
      "fs-xl",
      "fs-2xl",
      "fs-3xl",
      "fs-4xl",
    ]);
    expect(fixed.find((t) => t.id === "fs-m")?.value).toEqual({ value: 16, unit: "px" });
    expect(fixed.find((t) => t.id === "fs-l")?.value.value).toBe(20);
    expect(fixed.every((t) => t.fluid === undefined)).toBe(true);
    const fluid = typeScale({ base: 18, ratio: 1.25, minBase: 16, minRatio: 1.2 });
    expect(fluid.find((t) => t.id === "fs-m")?.fluid).toEqual({ min: 16, max: 18 });
    expect(fluid.find((t) => t.id === "fs-l")?.fluid).toEqual({ min: 19.2, max: 22.5 });
    expect(typeScale({ base: 0, ratio: 1.25 })).toEqual([]);
    expect(typeScale({ base: 16, ratio: 3 })).toEqual([]);
  });

  test("a spacing scale multiplies one gap; every token validates", () => {
    const scale = spaceScale({ base: 16, minBase: 12 });
    expect(scale.map((t) => t.value.value)).toEqual([4, 8, 12, 16, 24, 32, 48, 64, 96]);
    expect(scale.find((t) => t.id === "space-l")?.fluid).toEqual({ min: 24, max: 32 });
    const design = applyTokens(emptyDesign(), "spacings", scale);
    expect(DesignSystem.safeParse(design).success).toBe(true);
  });

  test("applying again updates tokens in place and keeps other variables", () => {
    const own = { id: "gutter", name: "Gutter", value: { value: 20, unit: "px" as const } };
    const start = { ...emptyDesign(), variables: { ...emptyDesign().variables, spacings: [own] } };
    const once = applyTokens(start, "spacings", spaceScale({ base: 16 }));
    const twice = applyTokens(once, "spacings", spaceScale({ base: 20 }));
    expect(twice.variables.spacings?.length).toBe(10);
    expect(twice.variables.spacings?.[0]).toEqual(own);
    expect(twice.variables.spacings?.find((v) => v.id === "space-s")?.value.value).toBe(20);
  });

  test("fluid tokens are emitted as clamp() custom properties, fixed ones as lengths", () => {
    const design = applyTokens(
      emptyDesign(),
      "fontSizes",
      typeScale({ base: 20, ratio: 1.2, minBase: 16 }),
    );
    const { css } = renderPage(page, design);
    expect(css).toContain("--emvb-fs-fs-m:clamp(1rem, 0.9022rem + 0.4348vw, 1.25rem)");
    const fixed = applyTokens(emptyDesign(), "fontSizes", typeScale({ base: 16, ratio: 1.2 }));
    expect(renderPage(page, fixed).css).toContain("--emvb-fs-fs-m:16px");
  });

  test("the site's fluid range must run from a narrower to a wider screen", () => {
    const ok = { ...emptyDesign(), fluidRange: { minWidth: 320, maxWidth: 1440 } };
    expect(DesignSystem.safeParse(ok).success).toBe(true);
    const bad = { ...emptyDesign(), fluidRange: { minWidth: 1000, maxWidth: 900 } };
    expect(DesignSystem.safeParse(bad).success).toBe(false);
  });
});
