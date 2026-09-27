/**
 * Editor chrome styles (DESIGN.md). The admin's Tailwind build is precompiled, so EmVB ships its
 * own rules, scoped to the editor root and built only from Kumo variables. Panels keep their
 * 1 px borders inside their width, so the canvas gets exactly the space between them (D-025).
 */
import { UI_CSS } from "../ui.ts";

export const EDITOR_CSS = `${UI_CSS}
[data-emvb-editor] {
  display: grid;
  grid-template-rows: 48px minmax(0, 1fr);
  background: var(--color-kumo-canvas);
  color: var(--text-color-kumo-default);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 20px;
}
[data-emvb-editor] *, [data-emvb-editor] *::before, [data-emvb-editor] *::after { box-sizing: border-box; }
.emvb-topbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 8px;
  min-width: 0;
  background: var(--color-kumo-base);
  border-bottom: 1px solid var(--color-kumo-hairline);
}
.emvb-topbar-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.emvb-topbar-start { display: flex; align-items: center; gap: 8px; min-width: 0; }
.emvb-topbar-end { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.emvb-save-status { display: flex; align-items: center; gap: 4px; font-size: 13px; line-height: 16px; color: var(--text-color-kumo-subtle); white-space: nowrap; }
.emvb-danger-icon { color: var(--color-kumo-danger); }
.emvb-link-button { border: 0; padding: 0; background: none; color: var(--text-color-kumo-default); font: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; }
.emvb-save-button { position: relative; }
.emvb-unsaved-dot { position: absolute; top: 4px; right: 4px; width: 8px; height: 8px; border-radius: 9999px; background: var(--text-color-kumo-default); }
.emvb-danger-text.emvb-danger-text { color: var(--text-color-kumo-danger); }
.emvb-frame { display: grid; grid-template-columns: 280px minmax(0, 1fr) 320px; min-height: 0; }
.emvb-panel { min-height: 0; overflow: auto; padding: 12px; background: var(--color-kumo-base); }
.emvb-panel-left { border-right: 1px solid var(--color-kumo-hairline); }
.emvb-panel-right { border-left: 1px solid var(--color-kumo-hairline); }
.emvb-panel-title { margin: 0; font-size: 16px; line-height: 20px; font-weight: 600; }
.emvb-panel-body, .emvb-field-group, .emvb-new-variable, .emvb-section-body { display: flex; flex-direction: column; gap: 12px; }
.emvb-field-group, .emvb-new-variable { gap: 8px; }
.emvb-section-header { display: flex; align-items: center; justify-content: space-between; width: 100%; height: 32px; padding: 0; border: 0; border-top: 1px solid var(--color-kumo-hairline); background: none; color: var(--text-color-kumo-default); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.emvb-section-header:focus-visible, .emvb-layer-row:focus-visible, .emvb-empty-prompt:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: 2px; }
.emvb-count { font-weight: 400; color: var(--text-color-kumo-subtle); }
.emvb-section-body { padding-top: 4px; }
.emvb-tabs, .emvb-tabs [role="tablist"] { width: 100%; }
.emvb-tabs [role="tab"] { flex: 1 1 0; justify-content: center; color: var(--text-color-kumo-default); }
.emvb-panel .emvb-field { width: 100%; }
.emvb-swatch { display: inline-block; width: 12px; height: 12px; margin-right: 6px; border-radius: 2px; box-shadow: inset 0 0 0 1px var(--color-kumo-line); vertical-align: -1px; }
.emvb-row-actions, .emvb-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
.emvb-dialog { display: flex; flex-direction: column; gap: 12px; }
.emvb-layers { margin: 0; padding: 0; list-style: none; }
.emvb-layer-row { display: flex; align-items: center; gap: 8px; width: 100%; height: 32px; padding-right: 8px; border: 0; border-radius: 6px; background: transparent; color: var(--text-color-kumo-default); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.emvb-layer-row:hover { background: var(--color-kumo-tint); }
.emvb-layer-row[aria-current="true"] { background: var(--color-kumo-brand); color: #fff; }
.emvb-layer-row:focus-visible { outline-offset: -2px; background: var(--color-kumo-base); }
.emvb-layer-row[aria-current="true"]:focus-visible { outline-color: #fff; background: var(--color-kumo-brand); }
.emvb-layer-preview { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-color-kumo-subtle); }
.emvb-layer-row[aria-current="true"] .emvb-layer-preview { color: inherit; }
.emvb-canvas { min-width: 0; min-height: 0; background: var(--color-kumo-canvas); }
.emvb-stage { position: relative; width: 100%; height: 100%; overflow: hidden; }
.emvb-canvas iframe { display: block; width: 100%; height: 100%; border: 0; background: #fff; }
.emvb-overlay { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.emvb-outline-hover, .emvb-outline-selected { position: absolute; box-shadow: inset 0 0 0 1px var(--color-kumo-brand); }
.emvb-outline-selected { box-shadow: inset 0 0 0 2px var(--color-kumo-brand); }
.emvb-overlay-label { position: absolute; display: inline-flex; align-items: center; gap: 4px; height: 24px; padding-left: 4px; border-radius: 4px; background: var(--color-kumo-brand); color: #fff; font-size: 12px; line-height: 16px; font-weight: 600; white-space: nowrap; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.1); pointer-events: auto; }
.emvb-overlay-action { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: inherit; cursor: pointer; }
.emvb-overlay-action:hover { background: var(--color-kumo-brand-hover); }
.emvb-overlay-action:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
.emvb-empty-canvas { display: flex; align-items: center; justify-content: center; height: 100%; padding: 24px; }
.emvb-empty-prompt { display: inline-flex; align-items: center; gap: 8px; padding: 32px; border: 1px dashed var(--color-kumo-line); border-radius: 6px; background: var(--color-kumo-base); color: var(--text-color-kumo-default); font: inherit; cursor: pointer; }
.emvb-state { display: flex; align-items: center; justify-content: center; min-height: 0; padding: 24px; background: var(--color-kumo-elevated); }
.emvb-small-screen { grid-row: 1 / -1; }
.emvb-shortcuts { width: 100%; border-collapse: collapse; font-size: 13px; }
.emvb-shortcuts td { padding: 6px 0; border-bottom: 1px solid var(--color-kumo-hairline); }
.emvb-shortcuts td:last-child { text-align: right; font-family: var(--font-mono); color: var(--text-color-kumo-subtle); }

.emvb-add-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.emvb-element-tile { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; min-height: 72px; padding: 12px 8px; border: 1px solid var(--color-kumo-hairline); border-radius: 6px; background: var(--color-kumo-base); color: var(--text-color-kumo-default); font: inherit; font-size: 12px; line-height: 16px; cursor: grab; }
.emvb-element-tile:hover { background: var(--color-kumo-tint); }
.emvb-element-tile:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: 2px; }
.emvb-element-tile:active { cursor: grabbing; }
.emvb-drop-line { position: absolute; background: var(--color-kumo-brand); pointer-events: none; z-index: 2; }
`;
