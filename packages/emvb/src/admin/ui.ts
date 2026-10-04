import type * as React from "react";

const solid = (color: string) =>
  ({
    "--kumo-button-emphasis-bg": color,
    "--kumo-button-emphasis-gradient-start": color,
    "--kumo-button-emphasis-gradient-end": color,
  }) as React.CSSProperties;

/**
 * Kumo paints emphasis buttons with a light gradient that leaves white text below AA. EmVB
 * flattens it to the solid fill (contrast override). Kumo lets `style` win.
 */
export const SOLID_PRIMARY = solid("var(--color-kumo-brand)");
export const SOLID_DESTRUCTIVE = solid("var(--text-color-kumo-danger)");

/** EmVB's compact control size: 28 px and a 6 px radius. Doubled to beat utilities. */
export const BUTTON = "emvb-btn";
export const FIELD = "emvb-field";

/**
 * Shared EmVB admin chrome (list pages, dialogs, setup states, conditions) plus compact
 * control sizing used inside the editor. Glass / elevation tokens match the
 * editor's denser elevated look.
 */
export const UI_CSS = `
[data-emvb-page],
[data-emvb-dialog],
[data-emvb-panel="conditions"] {
  --emvb-control: 28px;
  --emvb-glass-blur: 6px;
  --emvb-glass: color-mix(in oklab, var(--color-kumo-base) 97%, transparent);
  --emvb-glass-strong: var(--color-kumo-base);
  --emvb-glass-elevated: color-mix(in oklab, var(--color-kumo-elevated) 98%, transparent);
  --emvb-elevation-s: 0 0 0 1px var(--color-kumo-hairline), 0 1px 2px var(--color-kumo-shadow-edge), 0 1px 3px var(--color-kumo-shadow-drop);
  --emvb-elevation-m: 0 0 0 1px var(--color-kumo-line), 0 2px 4px var(--color-kumo-shadow-edge), 0 8px 20px var(--color-kumo-shadow-drop);
}
.emvb-btn.emvb-btn { height: 28px; border-radius: 6px; }
.emvb-icon-btn.emvb-icon-btn { width: 28px; height: 28px; border-radius: 6px; }
.emvb-field.emvb-field { height: 28px; border-radius: 6px; }
.emvb-field.emvb-field input,
.emvb-field.emvb-field select,
.emvb-field.emvb-field textarea,
.emvb-field.emvb-field [data-slot="control"] {
  border-radius: 6px;
}
.emvb-mono { font-family: var(--font-mono); }
.emvb-helper { margin: 0; font-size: 12px; line-height: 16px; color: var(--text-color-kumo-subtle); }
.emvb-inline-error { display: flex; gap: 4px; align-items: flex-start; margin: 0; font-size: 12px; line-height: 16px; color: var(--text-color-kumo-danger); }
.emvb-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 8px;
  border-radius: 9999px;
  font-size: 12px;
  line-height: 16px;
  background: var(--emvb-glass-strong, var(--color-kumo-base));
  box-shadow: inset 0 0 0 1px var(--color-kumo-hairline);
  white-space: nowrap;
}
.emvb-status-dot { width: 8px; height: 8px; border-radius: 9999px; background: var(--text-color-kumo-subtle); }
.emvb-status[data-status="published"] .emvb-status-dot { background: var(--color-kumo-success); }

/* List / setup pages */
.emvb-pages { display: flex; flex-direction: column; gap: 16px; }
.emvb-list-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.emvb-page-title { margin: 0; font-size: 24px; line-height: 1.25; font-weight: 600; color: var(--text-color-kumo-default); }
.emvb-row-title { color: var(--text-color-kumo-default); font-size: 14px; line-height: 20px; font-weight: 600; text-decoration: none; }
.emvb-row-title:hover { text-decoration: underline; text-underline-offset: 2px; }
.emvb-row-title:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: 2px; border-radius: 4px; }
.emvb-row-slug { font-family: var(--font-mono); font-size: 12px; line-height: 16px; color: var(--text-color-kumo-subtle); }
.emvb-tabular { font-variant-numeric: tabular-nums; color: var(--text-color-kumo-subtle); font-size: 13px; }

/* Elevated EmVB-owned card chrome (lists, empty/setup shells) — not host sidebar/header */
.emvb-surface-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: 6px;
  background: var(--emvb-glass-strong, var(--color-kumo-base));
  -webkit-backdrop-filter: blur(var(--emvb-glass-blur, 6px));
  backdrop-filter: blur(var(--emvb-glass-blur, 6px));
  box-shadow: var(--emvb-elevation-s);
}
.emvb-surface-card[data-emvb-list] { gap: 0; padding: 0; overflow: hidden; }
.emvb-surface-card[data-emvb-list] table { width: 100%; }
.emvb-surface-card .emvb-empty-shell,
.emvb-empty-shell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 200px;
  padding: 24px 16px;
  text-align: center;
}

/* Theme Builder type filters — underline tabs (same recipe as editor tabs) */
.emvb-theme-filters {
  display: flex;
  gap: 0;
  width: fit-content;
  max-width: 100%;
  min-height: 28px;
  margin: 0;
  padding: 0;
  overflow-x: auto;
  scrollbar-width: thin;
  border-bottom: 1px solid var(--color-kumo-hairline);
}
.emvb-theme-filter {
  height: 28px;
  min-height: 28px;
  padding: 0 12px 2px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--text-color-kumo-subtle);
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  font-weight: 400;
  cursor: pointer;
}
.emvb-theme-filter[data-active="true"],
.emvb-theme-filter[aria-selected="true"] {
  color: var(--text-color-kumo-default);
  font-weight: 600;
  box-shadow: inset 0 -2px 0 0 var(--color-kumo-brand);
}
.emvb-theme-filter { flex: none; white-space: nowrap; }
.emvb-theme-filter-count { margin-left: 6px; color: var(--text-color-kumo-subtle); font-weight: 400; }
.emvb-theme-filter:hover { color: var(--text-color-kumo-default); }
.emvb-theme-filter:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: 2px; }

/* EmVB-owned dialog body (Kumo Dialog keeps host radius/shadow) */
.emvb-dialog { display: flex; flex-direction: column; gap: 10px; }
.emvb-dialog-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.emvb-dialog :is(h2, [data-slot="title"]) {
  margin: 0;
  font-size: 14px;
  line-height: 18px;
  font-weight: 600;
  color: var(--text-color-kumo-default);
}
.emvb-dialog :is(p, [data-slot="description"]) {
  margin: 0;
  font-size: 13px;
  line-height: 1.35;
  color: var(--text-color-kumo-subtle);
}

/* Popup triggers (W-087): one elevated card per trigger, settings under its type */
.emvb-triggers { display: flex; flex-direction: column; gap: 8px; }
.emvb-triggers > .emvb-section-label:not(:first-child) { margin-top: 12px; }
.emvb-triggers > .emvb-section-label + .emvb-helper { margin-top: -4px; }
.emvb-trigger-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.emvb-trigger-row {
  display: flex; flex-direction: column; gap: 8px; padding: 8px; border-radius: 6px;
  background: var(--emvb-glass-elevated, var(--color-kumo-elevated)); box-shadow: var(--emvb-elevation-s);
}
.emvb-trigger-head { display: flex; align-items: flex-end; gap: 4px; }
.emvb-trigger-head > :first-child { flex: 1 1 auto; min-width: 0; }
.emvb-device-fieldset { display: flex; flex-wrap: wrap; gap: 4px 16px; min-width: 0; margin: 0; padding: 0; border: 0; }
.emvb-device-fieldset > legend { float: left; width: 100%; padding: 0; }
.emvb-device-fieldset > .emvb-helper { width: 100%; margin: 0; }
.emvb-device-option { display: inline-flex; align-items: center; gap: 6px; min-height: 28px; font-size: 13px; cursor: pointer; }
.emvb-device-option input { width: 16px; height: 16px; margin: 0; accent-color: var(--color-kumo-brand); }
.emvb-device-option input:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: 2px; }

/* Conditions editor (theme-part settings) */
.emvb-section-label {
  margin: 4px 0 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--text-color-kumo-default);
}
.emvb-condition-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.emvb-condition-row {
  display: grid;
  grid-template-columns: 96px 1fr 28px;
  gap: 6px;
  align-items: center;
  padding: 6px;
  border-radius: 6px;
  background: var(--emvb-glass-strong, var(--color-kumo-base));
  box-shadow: var(--emvb-elevation-s);
}
.emvb-condition-op,
.emvb-condition-where {
  height: var(--emvb-control, 28px);
  border-radius: 6px;
  border: 1px solid var(--color-kumo-hairline);
  background: var(--color-kumo-control, var(--color-kumo-base));
  color: var(--text-color-kumo-default);
  font: inherit;
  font-size: 13px;
  padding: 0 8px;
}
.emvb-condition-op:focus-visible,
.emvb-condition-where:focus-visible {
  outline: 2px solid var(--color-kumo-brand);
  outline-offset: 2px;
}
.emvb-condition-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }

@media (prefers-reduced-motion: reduce) {
  [data-emvb-editor] *, [data-emvb-page] * { transition: none !important; animation: none !important; }
}
@media (prefers-reduced-transparency: reduce) {
  .emvb-status,
  .emvb-surface-card,
  .emvb-condition-row {
    background: var(--color-kumo-base);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}
`;
