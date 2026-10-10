import { expect, test } from "bun:test";
import { UI_CSS } from "./ui.ts";

/** The declarations of the first rule whose selector is exactly `selector`. */
const rule = (selector: string) => {
  const start = UI_CSS.indexOf(`${selector} {`);
  if (start < 0) return "";
  return UI_CSS.slice(start, UI_CSS.indexOf("}", start));
};

test("Theme Builder filter tabs are 28 px, like every tab in DESIGN.md", () => {
  expect(rule(".emvb-theme-filter")).toMatch(/\bheight: 28px;/);
  expect(rule(".emvb-theme-filter")).toMatch(/min-height: 28px;/);
  expect(rule(".emvb-theme-filters")).toMatch(/min-height: 28px;/);
});

test("links in helper text are underlined in the default text colour, not primary (W-169)", () => {
  const link = rule(".emvb-helper a");
  expect(link).toMatch(/color: var\(--text-color-kumo-default\);/);
  expect(link).toMatch(/text-decoration: underline;/);
  expect(link.includes("brand")).toBe(false);
});

test("W-209: list titles and slugs wrap anywhere so the other columns stay visible", () => {
  expect(UI_CSS).toMatch(/\.emvb-row-title, \.emvb-row-slug \{ overflow-wrap: anywhere; \}/);
});
