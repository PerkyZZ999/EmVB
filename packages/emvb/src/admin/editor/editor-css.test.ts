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

/** The declarations of the first rule whose selector is exactly `selector`. */
const rule = (selector: string) => {
  const start = EDITOR_CSS.indexOf(`${selector} {`);
  return start < 0 ? "" : EDITOR_CSS.slice(start, EDITOR_CSS.indexOf("}", start));
};

test("editor tabs (Add | Layers, Content | Style, Variables | Classes) are 28 px (DESIGN.md)", () => {
  expect(EDITOR_CSS).toMatch(/--emvb-control: 28px;/);
  expect(rule('.emvb-tabs [role="tab"]')).toMatch(/\bheight: var\(--emvb-control\);/);
  expect(rule('.emvb-tabs [role="tab"]')).toMatch(/min-height: var\(--emvb-control\);/);
  expect(rule('.emvb-tabs [role="tablist"]')).toMatch(/min-height: var\(--emvb-control\);/);
});

test("the style state switcher is 28 px, and the state dot is a 6 px primary dot (W-089)", () => {
  expect(rule('.emvb-state-tabs [role="tablist"]')).toMatch(/[{;] height: var\(--emvb-control\);/);
  const dot = rule(".emvb-state-dot");
  expect(dot).toMatch(/width: 6px;/);
  expect(dot).toMatch(/height: 6px;/);
  expect(dot).toMatch(/background: var\(--color-kumo-brand\);/);
});
