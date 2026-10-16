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

test("panel group labels and section headers are 13 px sentence case in the default colour (UX-001)", () => {
  for (const selector of [".emvb-add-group-title", ".emvb-section-header"]) {
    const css = rule(selector);
    expect(css).toMatch(/font-size: 13px;/);
    expect(css).toMatch(/font-weight: 600;/);
    expect(css).toMatch(/color: var\(--text-color-kumo-default\);/);
    expect(/text-transform|letter-spacing/.test(css)).toBe(false);
  }
});

test("the Classes empty state stays on the editor's 12–16 px scale inside the drawer (UX-003)", () => {
  expect(rule(".emvb-site-empty-card h2")).toMatch(/font-size: 14px;/);
  expect(rule(".emvb-site-empty-card > div")).toMatch(/border: 0;/);
});

test("a link button sits at the start of a grid instead of stretching and centring (UX-003)", () => {
  expect(rule(".emvb-link-button")).toMatch(/justify-self: start;/);
});

test("property labels are 13 px, quieter while unset and semibold once set (UX-004)", () => {
  expect(rule(".emvb-panel-right .font-medium.select-none:not(button)")).toMatch(
    /font-size: 13px;[^}]*font-weight: 400;/,
  );
  for (const selector of [".emvb-box-label", ".emvb-var-field-label"])
    expect(rule(selector)).toMatch(/font-size: 13px;[^}]*font-weight: 400;/);
  const unset = EDITOR_CSS.match(/\.emvb-style-row \.font-medium[^{]*\{([^}]*)\}/)?.[1] ?? "";
  expect(unset).toMatch(/color: var\(--text-color-kumo-strong/);
  const set =
    EDITOR_CSS.match(/\.emvb-style-row\[data-set="true"\] \.font-medium[^{]*\{([^}]*)\}/)?.[1] ??
    "";
  expect(set).toMatch(/color: var\(--text-color-kumo-default\);/);
  expect(set).toMatch(/font-weight: 600;/);
  for (const label of [".emvb-box-label", ".emvb-var-field-label", ".emvb-choice-label"])
    expect(EDITOR_CSS.includes(`.emvb-style-row[data-set="true"] ${label}`)).toBe(true);
});

test("the overlay quick actions meet the 24 px minimum target (WCAG 2.5.8, UX-006)", () => {
  const action = rule(".emvb-overlay-action");
  expect(action).toMatch(/width: 24px;/);
  expect(action).toMatch(/height: 24px;/);
  expect(rule(".emvb-overlay-label")).toMatch(/height: 26px;/);
});

test("hovering the selected Layers row keeps its primary fill, so its white text stays readable (UX-008)", () => {
  expect(
    rule(
      '.emvb-layer-select[aria-current="true"], .emvb-layer-row:hover .emvb-layer-select[aria-current="true"]',
    ),
  ).toMatch(/background: var\(--color-kumo-brand\);/);
});

test("sections fade their rows in as they open and the Site styles drawer slides in (UX-010)", () => {
  expect(EDITOR_CSS).toMatch(
    /\n\.emvb-section-body \{ transition: opacity 150ms cubic-bezier\(0, 0, 0\.2, 1\); \}/,
  );
  expect(rule(".emvb-section-body[data-starting-style]")).toMatch(/opacity: 0;/);
  expect(rule(".emvb-section-body[data-ending-style]")).toMatch(/transition: none;/);
  expect(rule(".emvb-site-styles")).toMatch(
    /animation: emvb-drawer-enter 200ms cubic-bezier\(0, 0, 0\.2, 1\);/,
  );
  expect(EDITOR_CSS).toMatch(
    /@keyframes emvb-drawer-enter \{ from \{ opacity: 0; transform: translateX\(12px\); \}/,
  );
});
