import { expect, test } from "bun:test";
import { EDITOR_CSS } from "./editor-css.ts";

test("editor CSS never transitions colours (kumo-design)", () => {
  const transitions = [...EDITOR_CSS.matchAll(/transition:\s*([^;}]+)/g)].map((m) => m[1]?.trim());
  const colourish = transitions.filter(
    (t) =>
      t &&
      t !== "none" &&
      t !== "none !important" &&
      /colou?r|background|border|box-shadow|all/.test(t),
  );
  expect(colourish).toEqual([]);
});
