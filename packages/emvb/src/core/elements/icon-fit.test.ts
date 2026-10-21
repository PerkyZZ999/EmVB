import { describe, expect, test } from "bun:test";
import { ELEMENTS } from "./index.ts";

describe("W-803 a large icon fits a narrow screen", () => {
  test("the icon's svg and its link shrink to the box", () => {
    expect(ELEMENTS.icon.baseCss).toMatch(/\.emvb-icon svg\{[^}]*max-width:100%/);
    expect(ELEMENTS.icon.baseCss).toMatch(/\.emvb-icon-link\{[^}]*max-width:100%/);
  });
});
