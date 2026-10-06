import { expect, test } from "bun:test";
import { revealInMenus } from "./tab-reveal.ts";

test("selecting inside a menu opens its panel on the canvas", () => {
  document.body.innerHTML = [
    '<li class="emvb-menu-item" data-emvb-id="item0001">',
    '<div class="emvb-menu-item__bar">',
    '<details class="emvb-menu-item__disclosure">',
    '<div class="emvb-menu-panel"><span data-emvb-id="text0001">Hi</span></div>',
    "</details></div></li>",
  ].join("");
  revealInMenus(document, "text0001");
  const details = document.querySelector("details");
  expect(details?.open).toBe(true);
  revealInMenus(document, null);
  expect(details?.open).toBe(false);
});
