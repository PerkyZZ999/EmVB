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
  test("W-783 an item dismissed with Escape doesn't show its panel on hover", () => {
    const hover = hoverRules(menu.baseCss).flatMap(([sel]) =>
      sel.filter((s) => s.includes(":hover")),
    );
    expect(hover.length).toBeGreaterThan(0);
    for (const s of hover)
      expect(s).toContain(".emvb-menu-item:not([data-emvb-menu-dismissed]):hover");
  });
  test("W-784 a column menu's flyout is anchored to the item's bar, not the stretched item", () => {
    const css = menu.baseCss;
    expect(css).toContain(".emvb-menu--column .emvb-menu-item{position:static}");
    expect(css).toMatch(
      /\.emvb-menu--column \.emvb-menu-item__bar\{[^}]*position:relative[^}]*width:fit-content/,
    );
  });
  test("W-847 on a phone a column menu's flyout opens below its item, inside the screen", () => {
    const phone = menu.baseCss.match(/@media \(max-width: 767\.98px\)\{(.*?\})\}/)?.[1] ?? "";
    expect(phone).toContain(".emvb-menu--column .emvb-menu-panel,");
    expect(phone).toContain(".emvb-menu--column .emvb-menu-panel--wide{");
    expect(phone).toMatch(/\{top:100%;inset-inline:auto;inset-inline-start:0;/);
    expect(phone).toContain("max-width:calc(100vw - 2rem)");
  });
});
