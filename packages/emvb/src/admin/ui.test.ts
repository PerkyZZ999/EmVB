import { expect, test } from "bun:test";
import { UI_CSS } from "./ui.ts";

/** The declarations of the first rule whose selector is exactly `selector`. */
const rule = (selector: string) => {
  const start = UI_CSS.indexOf(`${selector} {`);
  if (start < 0) return "";
  return UI_CSS.slice(start, UI_CSS.indexOf("}", start));
};

test("Theme Builder filter tabs are 28 px, like every editor tab", () => {
  expect(rule(".emvb-theme-filter")).toMatch(/\bheight: 28px;/);
  expect(rule(".emvb-theme-filter")).toMatch(/min-height: 28px;/);
  expect(rule(".emvb-theme-filters")).toMatch(/min-height: 28px;/);
});
