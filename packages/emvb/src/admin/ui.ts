import type * as React from "react";

const solid = (color: string) =>
  ({
    "--kumo-button-emphasis-bg": color,
    "--kumo-button-emphasis-gradient-start": color,
    "--kumo-button-emphasis-gradient-end": color,
  }) as React.CSSProperties;

/**
 * Kumo paints emphasis buttons with a light gradient that leaves white text below AA. EmVB
 * flattens it to the solid fill (DESIGN.md, contrast override). Kumo lets `style` win.
 */
export const SOLID_PRIMARY = solid("var(--color-kumo-brand)");
export const SOLID_DESTRUCTIVE = solid("var(--text-color-kumo-danger)");

/** EmVB's compact control size: 28 px and a 6 px radius (DESIGN.md). Doubled to beat utilities. */
export const BUTTON = "emvb-btn";
export const FIELD = "emvb-field";

/**
 * Shared EmVB admin chrome (list pages, dialogs, setup states, conditions) plus compact
 * control sizing used inside the editor. Glass / elevation tokens match DESIGN.md and the
 * editor's mockup1 denser elevated look.
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
.emvb-helper a { color: var(--text-color-kumo-default); text-decoration: underline; text-underline-offset: 2px; }
.emvb-required-notice { margin-top: 4px; }
.emvb-required-notice__list { margin: 6px 0 0; padding: 0; list-style: none; display: grid; gap: 6px; font-size: 12px; line-height: 16px; }
.emvb-required-notice__list > li { padding-inline-start: 10px; border-inline-start: 2px solid currentColor; }
.emvb-required-notice__list strong { font-weight: 600; }
.emvb-required-notice__hint { display: block; margin-top: 8px; font-size: 12px; line-height: 16px; opacity: 0.85; }
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
.emvb-status[data-status="changed"] .emvb-status-dot { background: var(--color-kumo-warning, #d97706); }
.emvb-status[data-status="scheduled"] .emvb-status-dot { background: var(--color-kumo-info, #2563eb); }

/* List / setup pages */
.emvb-pages { display: flex; flex-direction: column; gap: 16px; }
.emvb-list-loading { min-height: 200px; }
.emvb-loading-status { margin: 0; padding: 24px 0; text-align: center; }
.emvb-list-skeleton-rows { display: grid; gap: 14px; }
.emvb-list-skeleton-row { display: grid; grid-template-columns: minmax(0, 2fr) repeat(2, minmax(0, 1fr)); gap: 16px; align-items: center; }
.emvb-list-skeleton-title { display: grid; gap: 4px; }
.emvb-list-loading .skeleton-line { background: var(--color-kumo-tint); }
.emvb-list-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.emvb-list-search { max-width: 320px; margin: 12px 0; }
.emvb-page-title { margin: 0; font-size: 24px; line-height: 1.25; font-weight: 600; color: var(--text-color-kumo-default); }
.emvb-row-title { color: var(--text-color-kumo-default); font-size: 14px; line-height: 20px; font-weight: 600; text-decoration: none; }
.emvb-row-title:hover { text-decoration: underline; text-underline-offset: 2px; }
.emvb-row-title:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: 2px; border-radius: 4px; }
.emvb-row-slug { font-family: var(--font-mono); font-size: 12px; line-height: 16px; color: var(--text-color-kumo-subtle); }
/* W-209: a long unbroken title or slug wraps instead of pushing Status and Last edited out of the card. */
.emvb-row-title, .emvb-row-slug { overflow-wrap: anywhere; }
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
/* Live MCP test: the AI agents page reads as cards with clear headings, not bare browser defaults. */
.emvb-agents { max-width: 960px; }
.emvb-agents-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.emvb-agents-save { min-height: 16px; margin: 0; }
.emvb-agents-header p { margin: 4px 0 0; font-size: 14px; line-height: 20px; color: var(--text-color-kumo-subtle); }
.emvb-agents-status { display: inline-flex; flex: none; align-items: center; gap: 6px; margin-top: 6px; padding: 2px 10px; border: 1px solid var(--color-kumo-line); border-radius: 999px; background: var(--color-kumo-base); color: var(--text-color-kumo-default); font-size: 12px; line-height: 20px; font-weight: 600; }
.emvb-agents-status > span { width: 8px; height: 8px; border-radius: 999px; background: var(--text-color-kumo-subtle); }
.emvb-agents-status[data-on="true"] > span { background: var(--text-color-kumo-success); }
.emvb-agents-section { gap: 16px; padding: 20px; }
.emvb-agents-head { display: flex; align-items: flex-start; gap: 12px; }
.emvb-agents-icon { display: grid; flex: none; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: var(--color-kumo-tint); color: var(--text-color-kumo-default); }
.emvb-agents-section h2 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 600; color: var(--text-color-kumo-default); }
.emvb-agents-section h3 { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 13px; line-height: 20px; font-weight: 600; color: var(--text-color-kumo-default); }
.emvb-agents-section p { margin: 0; font-size: 14px; line-height: 20px; color: var(--text-color-kumo-subtle); }
.emvb-agents-section code { padding: 1px 5px; border-radius: 4px; background: var(--color-kumo-tint); font-family: var(--font-mono); font-size: 12px; }
.emvb-agents-option { display: grid; gap: 4px; padding-top: 16px; border-top: 1px solid var(--color-kumo-line); }
.emvb-agents-option > p { padding-inline-start: 44px; font-size: 13px; }
.emvb-agents-field { display: grid; gap: 6px; }
.emvb-agents-snippets { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; }
.emvb-agents-snippet { display: grid; align-content: start; gap: 8px; min-width: 0; padding: 12px; border: 1px solid var(--color-kumo-line); border-radius: 8px; }
.emvb-agents-section pre { margin: 0; padding: 12px; overflow-x: auto; border-radius: 6px; background: var(--color-kumo-recessed, rgba(127,127,127,.08)); font-family: var(--font-mono); font-size: 12px; line-height: 18px; }
.emvb-agents-table { overflow-x: auto; margin-inline: -20px; margin-bottom: -20px; border-top: 1px solid var(--color-kumo-line); }
.emvb-agents-table table { width: 100%; }
.emvb-agents-when { color: var(--text-color-kumo-subtle); font-variant-numeric: tabular-nums; white-space: nowrap; }
.emvb-agents-who { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
.emvb-agents-link { display: inline-flex; align-items: center; gap: 4px; color: var(--text-color-kumo-link, var(--text-color-kumo-brand)); font-weight: 500; white-space: nowrap; }
.emvb-agents-link:hover { text-decoration: underline; }
.emvb-agents-link:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: 2px; border-radius: 4px; }
.emvb-timeline-agent { display: inline-flex; flex: none; align-items: center; gap: 3px; padding: 1px 7px 1px 5px; border: 1px solid var(--color-kumo-line); border-radius: 999px; background: var(--color-kumo-base); color: var(--text-color-kumo-default); font-size: 11px; line-height: 16px; font-weight: 600; }
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
.emvb-create-fields { display: flex; flex-direction: column; gap: 10px; min-width: 0; margin: 0; padding: 0; border: 0; }
.emvb-create-status { min-height: 18px; }
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
/* Accordion items and Tabs panels as a list (W-130) */
.emvb-item-list { display: flex; flex-direction: column; gap: 8px; }
.emvb-item-row {
  display: flex; flex-direction: column; gap: 4px; padding: 8px; border-radius: 6px;
  background: var(--emvb-glass-elevated, var(--color-kumo-elevated)); box-shadow: var(--emvb-elevation-s);
}
.emvb-item-actions { display: flex; justify-content: flex-end; gap: 2px; }
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
  grid-template-columns: 96px minmax(0, 1fr) 28px;
  gap: 6px;
  align-items: center;
  padding: 6px;
  border-radius: 6px;
  background: var(--emvb-glass-strong, var(--color-kumo-base));
  box-shadow: var(--emvb-elevation-s);
}
.emvb-panel-select { display: block; min-width: 0; }
.emvb-panel-select .emvb-field { width: 100%; min-width: 0; }
.emvb-condition-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }

@media (prefers-reduced-motion: reduce) {
  [data-emvb-editor] *, [data-emvb-page] * { transition: none !important; animation: none !important; }
  /* Kumo portals sit outside the editor/page roots; a dialog body identifies EmVB ownership. */
  [data-base-ui-portal]:has([data-emvb-dialog]),
  [data-base-ui-portal]:has([data-emvb-dialog]) *,
  [data-base-ui-portal]:has([data-emvb-dialog])::before,
  [data-base-ui-portal]:has([data-emvb-dialog])::after,
  [data-base-ui-portal]:has([data-emvb-dialog]) *::before,
  [data-base-ui-portal]:has([data-emvb-dialog]) *::after {
    transition: none !important;
    animation: none !important;
  }
  .emvb-list-loading .skeleton-line::after { animation: none !important; }
  [data-emvb-toasts],
  [data-emvb-toasts] *,
  [data-emvb-toasts]::before,
  [data-emvb-toasts]::after,
  [data-emvb-toasts] *::before,
  [data-emvb-toasts] *::after {
    transition: none !important;
    animation: none !important;
  }
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
