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

test("editor tabs (Add | Layers, Content | Style, Variables | Classes) are 28 px", () => {
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

test("the Site styles actions wrap on their own row and the title takes the free width (W-115)", () => {
  const actions = rule(".emvb-site-styles-actions");
  expect(actions).toMatch(/display: flex;/);
  expect(actions).toMatch(/flex-wrap: wrap;/);
  expect(rule(".emvb-site-styles-titles")).toMatch(/flex: 1 1 auto;/);
});

test("a long Layers name ellipsizes on one line instead of wrapping (W-168)", () => {
  const name = rule(".emvb-layer-name");
  expect(name).toMatch(/white-space: nowrap;/);
  expect(name).toMatch(/text-overflow: ellipsis;/);
  expect(name).toMatch(/overflow: hidden;/);
  expect(name).toMatch(/min-width: 0;/);
  expect(rule(".emvb-layer-select > svg")).toMatch(/flex: none;/);
});

test("unselected device and state options use the default text colour, for 4.5:1 contrast (W-244)", () => {
  expect(
    rule(
      '.emvb-device-tabs [role="tab"][aria-selected="false"], .emvb-state-tabs [role="tab"][aria-selected="false"]',
    ),
  ).toMatch(/color: var\(--text-color-kumo-default\);/);
});
