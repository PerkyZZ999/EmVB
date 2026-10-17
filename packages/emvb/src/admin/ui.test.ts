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

test("UX-005: a panel select fills its column instead of Kumo's content width", () => {
  expect(rule(".emvb-panel-select")).toMatch(/min-width: 0;/);
  const field = rule(".emvb-panel-select .emvb-field");
  expect(field).toMatch(/width: 100%;/);
  expect(field).toMatch(/min-width: 0;/);
});

test("UX-017: a display-condition row keeps its Where menu inside the panel", () => {
  expect(rule(".emvb-condition-row")).toMatch(/grid-template-columns: 96px minmax\(0, 1fr\) 28px;/);
});

test("UX-018: narrow lists keep dates and badges on one line and scroll sideways instead", () => {
  expect(rule(".emvb-surface-card[data-emvb-list]")).toMatch(/overflow-x: auto;/);
  expect(rule(".emvb-surface-card[data-emvb-list] :is(th, td):not(:first-child)")).toMatch(
    /white-space: nowrap;/,
  );
  expect(rule(".emvb-surface-card[data-emvb-list] td:first-child")).toMatch(/min-width: 180px;/);
});

test("UX-023: selects in EmVB dialogs span the dialog like its text fields", () => {
  expect(rule(".emvb-dialog .emvb-field")).toMatch(/width: 100%;/);
});

test("UX-027: native checkboxes and radios in EmVB use the accent colour", () => {
  expect(
    rule(':is([data-emvb-editor], [data-emvb-page]) input:is([type="checkbox"], [type="radio"])'),
  ).toMatch(/accent-color: var\(--color-kumo-brand\);/);
});

test("UX-038: a scrolling filter row fades at the edge that hides tabs, following its own scroll", () => {
  const at = UI_CSS.indexOf("@supports (animation-timeline: scroll()) {\n  .emvb-theme-filters {");
  const block = at < 0 ? "" : UI_CSS.slice(at, UI_CSS.indexOf("}\n}", at));
  expect(block).toContain("animation-timeline: scroll(self inline);");
  expect(block).toContain("var(--emvb-fade-start)");
  expect(block).toContain("calc(100% - var(--emvb-fade-end))");
  const frames = UI_CSS.slice(UI_CSS.indexOf("@keyframes emvb-edge-fade"));
  expect(frames).toMatch(/0% \{ --emvb-fade-start: 0px; --emvb-fade-end: 32px; \}/);
  expect(frames).toMatch(/100% \{ --emvb-fade-start: 32px; --emvb-fade-end: 0px; \}/);
  expect(UI_CSS).toContain(
    '@property --emvb-fade-end { syntax: "<length>"; inherits: false; initial-value: 0px; }',
  );
});
