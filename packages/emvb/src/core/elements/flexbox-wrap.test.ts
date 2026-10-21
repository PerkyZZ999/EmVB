import { describe, expect, test } from "bun:test";
import { ELEMENTS } from "./index.ts";

describe("W-800 long words wrap inside a flexbox", () => {
  test("the flexbox base CSS breaks long words anywhere, so flex items can shrink", () => {
    expect(ELEMENTS.flexbox.baseCss).toMatch(/\.emvb-flexbox\{[^}]*overflow-wrap:anywhere[^}]*\}/);
  });
});
