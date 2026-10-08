import { describe, expect, test } from "bun:test";
import { menu } from "./menu.ts";

/** The hover media block's rules, each as [selectors, declarations]. */
const hoverRules = (css: string): [string[], string][] =>
  [...css.matchAll(/@media \(hover:hover\) and \(pointer:fine\)\{(.*?)\}\}/g)].map((m) => {
    const [sel = "", decl = ""] = (m[1] ?? "").split("{");
    return [sel.split(","), decl];
  });

describe("W-267 menu dropdowns open on hover", () => {
  test("hover makes the closed details' content visible; focus alone doesn't", () => {
    const rules = hoverRules(menu.baseCss);
    const content = rules.find(([, decl]) => decl.includes("content-visibility:visible"));
    expect(content).toBeDefined();
    const selectors = content?.[0] ?? [];
    expect(selectors.some((s) => s.includes(":hover>") && s.endsWith("::details-content"))).toBe(
      true,
    );
    // Keyboard users open dropdowns with the toggle; Tab skips closed ones.
    expect(selectors.some((s) => s.includes(":focus-within"))).toBe(false);
  });

  test("the ::details-content rule stands alone, so older browsers keep the display rule", () => {
    const rules = hoverRules(menu.baseCss);
    const content = rules.find(([, decl]) => decl.includes("content-visibility:visible"));
    expect(content?.[0].every((s) => s.endsWith("::details-content"))).toBe(true);
    const display = rules.find(([, decl]) => decl.includes("display:block"));
    expect(display?.[0].some((s) => s.includes("::details-content"))).toBe(false);
  });
});
