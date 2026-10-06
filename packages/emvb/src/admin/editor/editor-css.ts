/**
 * Editor chrome styles. The admin's Tailwind build is precompiled, so EmVB ships its
 * own rules, scoped to the editor root and built only from Kumo variables. Panels keep their
 * 1 px borders inside their width, so the canvas gets exactly the space between them (D-025).
 * Density is compact (28 px controls, 44 px top bar, 256/288 panels) with near-opaque
 * elevated cards (hairline rings, soft lift shadows, light blur); the canvas stage stays clear.
 */
import { UI_CSS } from "../ui.ts";

export const EDITOR_CSS = `${UI_CSS}
[data-emvb-editor] {
  --emvb-control: 28px;
  --emvb-topbar: 44px;
  --emvb-panel-left: 256px;
  --emvb-panel-right: 288px;
  --emvb-glass-blur: 6px;
  --emvb-glass: color-mix(in oklab, var(--color-kumo-base) 97%, transparent);
  --emvb-glass-strong: var(--color-kumo-base);
  --emvb-glass-elevated: color-mix(in oklab, var(--color-kumo-elevated) 98%, transparent);
  --emvb-elevation-s: 0 0 0 1px var(--color-kumo-hairline), 0 1px 2px var(--color-kumo-shadow-edge), 0 1px 3px var(--color-kumo-shadow-drop);
  --emvb-elevation-m: 0 0 0 1px var(--color-kumo-line), 0 2px 4px var(--color-kumo-shadow-edge), 0 8px 20px var(--color-kumo-shadow-drop);
  display: grid;
  grid-template-rows: var(--emvb-topbar) minmax(0, 1fr);
  background: var(--color-kumo-canvas);
  color: var(--text-color-kumo-default);
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 18px;
}
[data-emvb-editor] *, [data-emvb-editor] *::before, [data-emvb-editor] *::after { box-sizing: border-box; }
.emvb-topbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto max-content;
  align-items: center;
  gap: 16px;
  min-height: 44px;
  height: var(--emvb-topbar);
  overflow: hidden;
  padding: 8px 16px;
  min-width: 0;
  background: var(--emvb-glass);
  -webkit-backdrop-filter: blur(var(--emvb-glass-blur));
  backdrop-filter: blur(var(--emvb-glass-blur));
  border-bottom: 1px solid var(--color-kumo-hairline);
  box-shadow: 0 1px 0 var(--color-kumo-shadow-edge), 0 1px 2px var(--color-kumo-shadow-drop);
  z-index: 1;
}
.emvb-topbar-title { min-width: 0; font-size: 14px; line-height: 18px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.emvb-topbar-start { display: flex; align-items: center; gap: 8px; min-width: 0; }
.emvb-topbar-end,
.emvb-topbar-tools,
.emvb-topbar-actions {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: nowrap !important;
  align-items: center;
}
.emvb-topbar-end { justify-content: flex-end; gap: 6px; min-width: max-content; flex-shrink: 0; }
.emvb-topbar-tools { gap: 2px; flex-shrink: 0; }
.emvb-topbar-actions { gap: 8px; margin-left: 8px; padding-left: 8px; border-left: 1px solid var(--color-kumo-hairline); flex-shrink: 0; }
.emvb-topbar-actions > * { flex: 0 0 auto !important; width: auto !important; max-width: none !important; }
.emvb-save-status { display: flex; align-items: center; gap: 4px; font-size: 12px; line-height: 16px; color: var(--text-color-kumo-subtle); white-space: nowrap; }
.emvb-danger-icon { color: var(--color-kumo-danger); }
.emvb-link-button { border: 0; padding: 0; background: none; color: var(--text-color-kumo-default); font: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; }
.emvb-save-button, .emvb-publish-button { position: relative; }
.emvb-styles-dot { position: absolute; top: 4px; right: 4px; width: 8px; height: 8px; border-radius: 9999px; background: currentColor; }
.emvb-unsaved-dot { position: absolute; top: 4px; right: 4px; width: 8px; height: 8px; border-radius: 9999px; background: var(--text-color-kumo-default); }
.emvb-danger-text.emvb-danger-text { color: var(--text-color-kumo-danger); }
.emvb-frame { display: grid; grid-template-columns: var(--emvb-panel-left) minmax(0, 1fr) var(--emvb-panel-right); min-height: 0; }
.emvb-panel {
  min-height: 0;
  overflow: auto;
  padding: 10px 12px;
  background: var(--emvb-glass);
  -webkit-backdrop-filter: blur(var(--emvb-glass-blur));
  backdrop-filter: blur(var(--emvb-glass-blur));
}
.emvb-panel-left {
  border-right: 1px solid var(--color-kumo-hairline);
  box-shadow: 1px 0 0 var(--color-kumo-shadow-edge), 4px 0 12px var(--color-kumo-shadow-drop);
}
.emvb-panel-right {
  border-left: 1px solid var(--color-kumo-hairline);
  box-shadow: -1px 0 0 var(--color-kumo-shadow-edge), -4px 0 12px var(--color-kumo-shadow-drop);
}
.emvb-panel-title { margin: 0; font-size: 14px; line-height: 18px; font-weight: 600; }
.emvb-panel-body, .emvb-field-group, .emvb-new-variable, .emvb-section-body { display: flex; flex-direction: column; gap: 10px; }
.emvb-field-group, .emvb-new-variable { gap: 8px; }
.emvb-section-header { display: flex; align-items: center; justify-content: space-between; width: 100%; height: var(--emvb-control); margin-top: 4px; padding: 0; border: 0; border-top: 1px solid var(--color-kumo-hairline); background: none; color: var(--text-color-kumo-strong, var(--text-color-kumo-default)); font: inherit; font-size: 12px; font-weight: 600; letter-spacing: 0.01em; cursor: pointer; }
.emvb-section-header:focus-visible, .emvb-layer-row:focus-visible, .emvb-empty-prompt:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: 2px; }
.emvb-count { margin-left: 4px; font-size: 12px; line-height: 16px; font-weight: 400; color: var(--text-color-kumo-subtle); }
.emvb-section-body { padding-top: 4px; padding-bottom: 4px; }
.emvb-tabs { width: 100%; }
.emvb-tabs [role="tablist"] {
  width: 100%;
  min-height: var(--emvb-control);
  gap: 0;
  padding-bottom: 0;
  margin-bottom: 2px;
  border-bottom: 1px solid var(--color-kumo-hairline);
}
.emvb-tabs [role="tab"] {
  flex: 1 1 0;
  justify-content: center;
  gap: 4px;
  height: var(--emvb-control);
  min-height: var(--emvb-control);
  padding: 0 8px 2px;
  color: var(--text-color-kumo-subtle);
  font-size: 13px;
  line-height: 18px;
  font-weight: 400;
  border-radius: 0;
}
.emvb-tabs [role="tab"][aria-selected="true"] {
  color: var(--text-color-kumo-default);
  font-weight: 600;
  box-shadow: inset 0 -2px 0 0 var(--color-kumo-brand);
}
.emvb-tabs [role="tab"][aria-selected="true"] svg { color: var(--color-kumo-brand); }
.emvb-tabs [role="tab"]:hover { color: var(--text-color-kumo-default); }
.emvb-panel .emvb-field { width: 100%; }
.emvb-state-switch { display: flex; flex-direction: column; gap: 6px; }
.emvb-state-tabs { width: 100%; }
.emvb-state-tabs [role="tablist"] { width: 100%; height: var(--emvb-control); min-height: var(--emvb-control); }
.emvb-state-tabs [role="tab"] { flex: 1 1 0; justify-content: center; gap: 4px; height: 100%; font-size: 13px; line-height: 18px; }
.emvb-state-dot { display: inline-block; flex: none; width: 6px; height: 6px; margin-left: 6px; border-radius: 999px; background: var(--color-kumo-brand); vertical-align: middle; }
.emvb-style-row[data-inherited] [role="combobox"] { color: var(--text-color-kumo-subtle); }
.emvb-swatch { display: inline-block; width: 12px; height: 12px; margin-right: 6px; border-radius: 2px; box-shadow: inset 0 0 0 1px var(--color-kumo-line); vertical-align: -1px; }
.emvb-swatches { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.emvb-swatch-button { display: inline-flex; width: 24px; height: 24px; padding: 3px; border: 0; border-radius: 4px; background: transparent; box-shadow: inset 0 0 0 1px var(--color-kumo-line); cursor: pointer; }
.emvb-swatch-button .emvb-swatch { width: 100%; height: 100%; margin: 0; }
.emvb-swatch-button[aria-pressed="true"] { box-shadow: inset 0 0 0 2px var(--color-kumo-brand); }
.emvb-swatch-button:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: 1px; }
.emvb-custom-color { display: flex; flex-direction: column; gap: 4px; }
.emvb-custom-color-row { display: flex; align-items: flex-end; gap: 8px; }
.emvb-custom-color-row > :first-child { flex: 1; min-width: 0; }
.emvb-color-picker { width: 28px; height: 28px; padding: 2px; border: 0; border-radius: 6px; background: var(--color-kumo-control); box-shadow: inset 0 0 0 1px var(--color-kumo-line); cursor: pointer; }
.emvb-fill-types { display: flex; flex-wrap: wrap; gap: 4px; }
.emvb-fill-types button { min-height: 28px; padding: 0 10px; border: 0; border-radius: 6px; background: var(--color-kumo-control); color: var(--text-color-kumo-default); box-shadow: inset 0 0 0 1px var(--color-kumo-line); cursor: pointer; }
.emvb-fill-types button[aria-checked="true"] { background: var(--color-kumo-brand); color: #fff; box-shadow: none; }
.emvb-angle { display: flex; flex-direction: column; gap: 4px; }
.emvb-angle-slider { width: 100%; accent-color: var(--color-kumo-brand); }
.emvb-gradient-stop { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; box-shadow: inset 0 1px 0 var(--color-kumo-line); }
.emvb-row-actions { display: flex; justify-content: flex-end; gap: 8px; }
.emvb-layers { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 1px; }
.emvb-layer-row { display: flex; align-items: center; gap: 6px; width: 100%; height: var(--emvb-control); padding-right: 4px; border-radius: 6px; color: var(--text-color-kumo-default); font-size: 13px; }
.emvb-layer-select { display: flex; align-items: center; gap: 6px; flex: 1 1 auto; min-width: 0; height: var(--emvb-control); padding: 0 4px 0 0; border: 0; border-radius: 6px; background: transparent; color: inherit; font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.emvb-layer-row:hover, .emvb-layer-row:hover .emvb-layer-select { background: var(--color-kumo-tint); }
.emvb-layers:empty::after, .emvb-panel-body > .emvb-helper { color: var(--text-color-kumo-subtle); }
.emvb-layer-select[aria-current="true"] { background: var(--color-kumo-brand); color: #fff; }
.emvb-layer-select:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: -2px; }
.emvb-layer-select[aria-current="true"]:focus-visible { outline-color: #fff; }
.emvb-layer-rename { flex: 1 1 auto; min-width: 0; height: var(--emvb-control); padding: 0 6px; border: 1px solid var(--color-kumo-brand); border-radius: 6px; background: transparent; color: inherit; font: inherit; font-size: 13px; }
.emvb-layer-preview { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-color-kumo-subtle); }
.emvb-layer-select[aria-current="true"] .emvb-layer-preview { color: inherit; }
.emvb-canvas { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: var(--color-kumo-canvas); }
.emvb-device-bar { display: flex; flex: none; align-items: center; justify-content: center; gap: 12px; height: 36px; border-bottom: 1px solid var(--color-kumo-line); background: var(--color-kumo-surface); }
/* W-127: the segmented control hugs its three options; a fixed width left a gap on the right. */
.emvb-device-tabs { width: max-content; }
.emvb-device-label { display: inline-flex; align-items: center; gap: 6px; }
.emvb-device-hide { display: inline-flex; align-items: center; gap: 6px; color: var(--text-color-kumo-default); font-size: 13px; }
.emvb-stage { position: relative; display: flex; flex: 1 1 auto; justify-content: safe center; min-height: 0; width: 100%; overflow: hidden; }
/* W-158: at 100% a page wider than the stage scrolls sideways. */
.emvb-stage[data-emvb-zoom="actual"] { overflow-x: auto; }
.emvb-stage-frame { position: relative; flex: none; height: 100%; overflow: hidden; }
.emvb-stage-scaler { position: absolute; top: 0; left: 0; transform-origin: 0 0; }
.emvb-zoom { min-width: 64px; font-variant-numeric: tabular-nums; }
.emvb-preview-split { display: inline-flex; gap: 2px; }
.emvb-canvas iframe { display: block; width: 100%; height: 100%; border: 0; background: #fff; }
.emvb-canvas-text {
  position: absolute;
  z-index: 6;
  box-sizing: border-box;
  margin: 0;
  border: 0;
  overflow: hidden;
  resize: none;
  background: transparent;
  outline: 1px solid var(--color-kumo-brand);
  outline-offset: -1px;
}
.emvb-overlay { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.emvb-outline-hover, .emvb-outline-selected { position: absolute; box-shadow: inset 0 0 0 1px var(--color-kumo-brand); }
.emvb-outline-selected { box-shadow: inset 0 0 0 1.5px var(--color-kumo-brand), 0 0 0 1px color-mix(in oklab, var(--color-kumo-brand) 25%, transparent); }
.emvb-overlay-label {
  position: absolute;
  display: inline-flex;
  align-items: center;
  gap: 0;
  height: 26px;
  padding: 1px 1px 1px 6px;
  border-radius: 5px;
  background: var(--color-kumo-brand);
  color: #fff;
  font-size: 11px;
  line-height: 14px;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
  box-shadow: 0 1px 2px var(--color-kumo-shadow-edge), 0 2px 6px var(--color-kumo-shadow-drop);
  pointer-events: none;
}
.emvb-overlay-label > span { padding: 0 4px; }
.emvb-overlay-action { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: inherit; cursor: pointer; pointer-events: auto; }
.emvb-overlay-action:hover { background: var(--color-kumo-brand-hover); }
.emvb-overlay-action:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
.emvb-empty-canvas { display: flex; align-items: center; justify-content: center; height: 100%; padding: 24px; }
.emvb-empty-prompt { display: inline-flex; align-items: center; gap: 8px; padding: 24px; border: 1px dashed var(--color-kumo-line); border-radius: 6px; background: var(--emvb-glass-strong); -webkit-backdrop-filter: blur(var(--emvb-glass-blur)); backdrop-filter: blur(var(--emvb-glass-blur)); color: var(--text-color-kumo-default); font: inherit; cursor: pointer; box-shadow: var(--emvb-elevation-s); }
.emvb-state { display: flex; align-items: center; justify-content: center; min-height: 0; padding: 24px; background: var(--color-kumo-elevated); }
.emvb-small-screen { grid-row: 1 / -1; }
.emvb-shortcuts { width: 100%; border-collapse: collapse; font-size: 13px; }
.emvb-shortcuts td { padding: 6px 0; border-bottom: 1px solid var(--color-kumo-hairline); }
.emvb-shortcuts td:last-child { text-align: right; font-family: var(--font-mono); color: var(--text-color-kumo-subtle); }

.emvb-add-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.emvb-element-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 60px;
  padding: 10px 8px;
  border: 1px solid var(--color-kumo-hairline);
  border-radius: 6px;
  background: var(--emvb-glass-strong);
  color: var(--text-color-kumo-subtle);
  font: inherit;
  font-size: 11px;
  line-height: 14px;
  font-weight: 500;
  cursor: grab;
  box-shadow: var(--emvb-elevation-s);
}
.emvb-element-tile svg {
  width: 20px;
  height: 20px;
  color: var(--text-color-kumo-default);
  flex: 0 0 auto;
}
.emvb-element-tile:hover {
  background: var(--color-kumo-base);
  border-color: var(--color-kumo-line);
  color: var(--text-color-kumo-default);
  box-shadow: 0 0 0 1px var(--color-kumo-line), 0 2px 6px var(--color-kumo-shadow-drop);
}
.emvb-element-tile:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: 2px; }
.emvb-element-tile:active { cursor: grabbing; }
.emvb-drop-line { position: absolute; background: var(--color-kumo-brand); pointer-events: none; z-index: 2; height: auto; min-height: 3px; min-width: 3px; box-shadow: 0 0 0 1px var(--color-kumo-base, #fff); border-radius: 2px; }
/* W-128: the container a drop goes into is tinted and named. */
.emvb-drop-target { position: absolute; pointer-events: none; z-index: 1; border: 2px dashed var(--color-kumo-brand); background: color-mix(in srgb, var(--color-kumo-brand) 6%, transparent); border-radius: 4px; box-sizing: border-box; }
.emvb-drop-target-label { position: absolute; pointer-events: none; z-index: 2; height: 22px; padding: 2px 8px; border-radius: 4px; background: var(--color-kumo-brand); color: #fff; font-size: 12px; line-height: 18px; white-space: nowrap; box-sizing: border-box; }

.emvb-left-panel { gap: 12px; }
.emvb-add-group { display: flex; flex-direction: column; gap: 8px; }
.emvb-add-group-title { margin: 0; font-size: 11px; line-height: 14px; font-weight: 600; color: var(--text-color-kumo-subtle); text-transform: uppercase; letter-spacing: 0.05em; }
.emvb-layer-caret { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; flex: 0 0 16px; }
.emvb-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

.emvb-outline-invalid { position: absolute; box-shadow: inset 0 0 0 1px var(--color-kumo-danger); outline: 1px dashed var(--color-kumo-danger); outline-offset: -1px; pointer-events: none; }
.emvb-invalid-label { position: absolute; display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 6px; border-radius: 4px; background: var(--emvb-glass-strong); -webkit-backdrop-filter: blur(var(--emvb-glass-blur)); backdrop-filter: blur(var(--emvb-glass-blur)); color: var(--text-color-kumo-danger); font-size: 12px; line-height: 16px; font-weight: 600; white-space: nowrap; box-shadow: var(--emvb-elevation-s); pointer-events: none; z-index: 3; }
.emvb-overlay-move { cursor: grab; }
.emvb-overlay-move:active { cursor: grabbing; }
@media (prefers-reduced-motion: reduce) {
  .emvb-drop-line { transition: none !important; }
}

.emvb-layer-menu { position: relative; margin-left: auto; }
.emvb-layer-menu-btn { border: 0; background: transparent; color: inherit; cursor: pointer; padding: 0 4px; border-radius: 4px; line-height: 1; min-width: 24px; min-height: 24px; }
.emvb-layer-menu-btn:hover { background: var(--color-kumo-tint); }
.emvb-layer-menu-list {
  position: absolute;
  right: 0;
  top: 100%;
  z-index: 5;
  min-width: 140px;
  padding: 4px;
  border-radius: 6px;
  background: var(--emvb-glass-strong);
  -webkit-backdrop-filter: blur(var(--emvb-glass-blur));
  backdrop-filter: blur(var(--emvb-glass-blur));
  box-shadow: var(--emvb-elevation-m);
  display: flex;
  flex-direction: column;
}
.emvb-layer-menu-list button { border: 0; background: transparent; text-align: left; padding: 6px 8px; border-radius: 4px; font: inherit; font-size: 13px; cursor: pointer; color: var(--text-color-kumo-default); min-height: 28px; }
.emvb-layer-menu-list button:hover { background: var(--color-kumo-tint); }
.emvb-layer-menu-list button:disabled { color: var(--text-color-kumo-subtle); cursor: not-allowed; background: transparent; }
.emvb-menu-hint { margin: 4px 8px 2px; max-width: 200px; font-size: 12px; line-height: 16px; color: var(--text-color-kumo-subtle); }
.emvb-layer-menu-hint { margin: 4px 8px 2px; max-width: 180px; font-size: 12px; line-height: 16px; color: var(--text-color-kumo-subtle); }

.emvb-element-header { display: flex; align-items: center; gap: 8px; }
.emvb-element-header svg { color: var(--color-kumo-brand); flex: 0 0 auto; }
.emvb-breadcrumb { margin: 0; font-size: 12px; line-height: 16px; color: var(--text-color-kumo-subtle); }
.emvb-breadcrumb-part { border: 0; padding: 0; background: none; color: inherit; font: inherit; cursor: pointer; text-decoration: none; border-radius: 2px; }
.emvb-breadcrumb-part:hover { color: var(--text-color-kumo-default); text-decoration: underline; text-underline-offset: 2px; }
.emvb-breadcrumb-part:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: 2px; }
.emvb-style-row { display: flex; align-items: flex-start; gap: 4px; }
.emvb-shadow-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.emvb-add-shadow { align-self: flex-start; }
.emvb-style-row[data-emvb-style="boxShadow"] > .emvb-reset-btn { margin-top: -4px; }
.emvb-filters { display: flex; flex-direction: column; gap: 10px; }
.emvb-sub-label { margin: 0; font-size: 13px; line-height: 18px; font-weight: 600; color: var(--text-color-kumo-default); }
.emvb-style-row > :first-child { flex: 1 1 auto; min-width: 0; }
.emvb-style-row[data-set="true"] .emvb-reset-btn { opacity: 1; }
.emvb-reset-btn { flex: 0 0 auto; margin-top: 28px; opacity: 0.4; }
/* Unit menu inside a length field (W-088): 24 px inside a 28 px field, radii nest (6 = 4 + 2). */
.emvb-length .emvb-unit-addon.emvb-unit-addon { padding-right: 2px; }
.emvb-unit-btn {
  display: inline-flex; align-items: center; gap: 2px; height: 24px; padding: 0 4px 0 6px; border: 0; border-radius: 4px;
  background: transparent; color: var(--text-color-kumo-subtle); font-family: var(--font-mono); font-size: 12px; line-height: 16px; cursor: pointer;
}
.emvb-unit-btn:hover, .emvb-unit-btn[data-popup-open] { background: var(--color-kumo-tint); color: var(--text-color-kumo-default); }
.emvb-unit-btn:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: -2px; }
/* Variable button and bound-variable chip (W-087) */
.emvb-var-btn {
  display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto;
  width: 28px; height: 28px; margin-top: 28px; padding: 0; border: 0; border-radius: 6px;
  background: transparent; color: var(--text-color-kumo-subtle); cursor: pointer;
}
/* Linked four-box control (W-138, D-044): padding, margin, border width, radius. */
.emvb-box > .emvb-box-body { display: flex; flex-direction: column; gap: 4px; }
.emvb-box > .emvb-reset-btn { margin-top: 0; }
.emvb-box-head { display: flex; align-items: center; gap: 2px; min-height: 28px; }
.emvb-box-label { flex: 1 1 auto; min-width: 0; font-size: 14px; line-height: 20px; font-weight: 500; color: var(--text-color-kumo-default); }
.emvb-box-head .emvb-var-btn { margin-top: 0; }
.emvb-link-btn {
  display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto;
  width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px;
  background: transparent; color: var(--text-color-kumo-subtle); cursor: pointer;
}
.emvb-link-btn:hover { background: var(--color-kumo-tint); color: var(--text-color-kumo-default); }
.emvb-link-btn[aria-pressed="true"] { color: var(--color-kumo-brand); background: var(--color-kumo-tint); }
.emvb-link-btn:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: 1px; }
.emvb-box-sides { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
.emvb-box-side { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 0; }
.emvb-box-input {
  width: 100%; height: 28px; padding: 0 4px; border: 0; border-radius: 6px; text-align: center;
  background: var(--color-kumo-control); color: var(--text-color-kumo-default); font-size: 13px;
  box-shadow: inset 0 0 0 1px var(--color-kumo-line);
}
.emvb-box-input::placeholder { color: var(--text-color-kumo-subtle); }
.emvb-box-input:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: -1px; }
.emvb-box-input[aria-invalid="true"] { box-shadow: inset 0 0 0 1px var(--text-color-kumo-danger); }
.emvb-box-input[data-bound="true"] { color: var(--color-kumo-brand); }
.emvb-box-name { font-size: 11px; line-height: 14px; color: var(--text-color-kumo-subtle); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.emvb-box-error { margin: 0; font-size: 12px; line-height: 16px; color: var(--text-color-kumo-danger); }
.emvb-var-btn:hover, .emvb-var-btn[data-popup-open] { background: var(--color-kumo-tint); color: var(--text-color-kumo-default); }
.emvb-var-btn[data-active="true"] { color: var(--color-kumo-brand); }
.emvb-var-btn:focus-visible, .emvb-var-chip-x:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: 1px; }
.emvb-var-field { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.emvb-var-field-label { font-size: 14px; line-height: 20px; font-weight: 500; color: var(--text-color-kumo-default); }
.emvb-var-chip {
  display: flex; align-items: center; gap: 6px; min-width: 0; height: 28px; padding: 0 2px 0 8px;
  border-radius: 6px; background: var(--color-kumo-tint); color: var(--text-color-kumo-default);
  box-shadow: inset 0 0 0 1px var(--color-kumo-line); font-family: var(--font-mono); font-size: 13px;
}
.emvb-var-chip > svg { flex: 0 0 auto; color: var(--color-kumo-brand); }
.emvb-var-chip[data-missing="true"] { box-shadow: inset 0 0 0 1px var(--text-color-kumo-danger); }
.emvb-var-chip[data-missing="true"] > svg { color: var(--text-color-kumo-danger); }
.emvb-var-chip-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.emvb-var-chip-value { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--text-color-kumo-subtle); }
.emvb-var-chip-x {
  display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto;
  width: 24px; height: 24px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: inherit; cursor: pointer;
}
.emvb-var-chip-x:hover { background: var(--color-kumo-recessed); }
.emvb-var-option { display: flex; align-items: center; gap: 8px; min-width: 176px; max-width: 256px; }
.emvb-var-option-sample { flex: 0 0 20px; text-align: center; font-size: 13px; color: var(--text-color-kumo-subtle); }
.emvb-var-option-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.emvb-var-option-value { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); font-size: 11px; color: var(--text-color-kumo-subtle); }
[data-emvb-var-option][data-selected="true"] .emvb-var-option-name { font-weight: 600; }
.emvb-textarea { min-height: 72px; height: auto; padding: 8px; resize: vertical; font: inherit; }
.emvb-field-label { font-size: 12px; font-weight: 500; color: var(--text-color-kumo-subtle); }
.emvb-panel [data-emvb-panel] .emvb-helper { margin-top: -2px; }

.emvb-media-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.emvb-media-preview { display: flex; flex-direction: column; gap: 4px; }
.emvb-media-thumb { display: block; max-width: 100%; max-height: 96px; border-radius: 6px; object-fit: contain; background: var(--color-kumo-canvas); }
.emvb-media-dialog {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--color-kumo-hairline);
  border-radius: 6px;
  background: var(--emvb-glass-elevated);
  -webkit-backdrop-filter: blur(var(--emvb-glass-blur));
  backdrop-filter: blur(var(--emvb-glass-blur));
  box-shadow: var(--emvb-elevation-m);
}
.emvb-media-dialog-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.emvb-media-grid { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; max-height: 256px; overflow: auto; }
.emvb-media-card { display: flex; flex-direction: column; gap: 4px; width: 100%; padding: 4px; border: 1px solid var(--color-kumo-hairline); border-radius: 6px; background: var(--emvb-glass-strong); color: var(--text-color-kumo-default); font: inherit; font-size: 11px; line-height: 14px; text-align: left; cursor: pointer; }
.emvb-media-card:hover { background: var(--color-kumo-tint); }
.emvb-media-card img { display: block; width: 100%; height: 64px; object-fit: cover; border-radius: 4px; background: var(--color-kumo-canvas); }
.emvb-media-card span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.emvb-icon-grid { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; max-height: 256px; overflow: auto; }
.emvb-icon-tile { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%; padding: 8px 4px; border: 1px solid var(--color-kumo-hairline); border-radius: 6px; background: var(--emvb-glass-strong); color: var(--text-color-kumo-default); font: inherit; font-size: 11px; line-height: 14px; cursor: pointer; }
.emvb-icon-tile:hover { background: var(--color-kumo-tint); }
.emvb-icon-tile[data-selected="true"] { border-color: var(--color-kumo-brand); background: var(--color-kumo-tint); }
.emvb-icon-tile span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }

/* Class chip input (W-087): one 28 px box holding the chips and the text input */
.emvb-class-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
.emvb-chip-anchor { position: relative; }
.emvb-chip-box {
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px;
  min-height: var(--emvb-control); padding: 4px; border-radius: 6px; cursor: text;
  background: var(--color-kumo-control, var(--color-kumo-base));
  box-shadow: inset 0 0 0 1px var(--color-kumo-line);
}
.emvb-chip-box:focus-within { box-shadow: inset 0 0 0 1px var(--color-kumo-brand); }
.emvb-chip {
  display: inline-flex; align-items: center; min-width: 0; max-width: 100%; height: 20px;
  border-radius: 4px; background: var(--color-kumo-tint); color: var(--text-color-kumo-default);
  font-family: var(--font-sans); font-size: 12px; line-height: 16px;
}
.emvb-chip:hover { background: var(--color-kumo-recessed); }
.emvb-chip[data-active="true"] { background: var(--color-kumo-brand); color: #fff; }
.emvb-chip-main {
  display: inline-flex; align-items: center; gap: 4px; min-width: 0; height: 20px; padding: 0 4px;
  border: 0; border-radius: 4px; background: transparent; color: inherit; font: inherit; cursor: pointer;
}
.emvb-chip-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 144px; }
.emvb-chip-icon {
  display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto;
  width: 16px; height: 20px; padding: 0; border: 0; border-radius: 4px;
  background: transparent; color: inherit; cursor: pointer;
}
.emvb-chip-icon:last-child { margin-right: 2px; }
.emvb-chip-icon:hover { background: color-mix(in oklab, currentColor 14%, transparent); }
.emvb-chip :focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: 1px; }
.emvb-chip[data-active="true"] :focus-visible { outline-color: #fff; outline-offset: -2px; }
.emvb-chip-rename {
  width: 128px; height: 20px; padding: 0 4px; border: 0; border-radius: 4px; outline: 0;
  background: var(--color-kumo-base); color: var(--text-color-kumo-default); font: inherit;
  box-shadow: inset 0 0 0 1px var(--color-kumo-brand);
}
.emvb-chip-text {
  flex: 1 0 72px; min-width: 72px; height: 20px; padding: 0 4px; border: 0; outline: 0;
  background: transparent; color: var(--text-color-kumo-default); font: inherit; font-size: 13px;
}
.emvb-save-local { align-self: flex-start; font-size: 13px; }
.emvb-save-local-row { display: flex; flex-direction: column; gap: 8px; }
.emvb-save-local-actions { display: flex; gap: 8px; }
.emvb-chip-text::placeholder { color: var(--text-color-kumo-placeholder, var(--text-color-kumo-subtle)); }
.emvb-chip-listbox {
  position: absolute; z-index: 20; top: calc(100% + 4px); left: 0; right: 0;
  display: flex; flex-direction: column; gap: 2px; max-height: 240px; overflow: auto;
  margin: 0; padding: 4px; list-style: none; border-radius: 8px;
  background: var(--color-kumo-base); box-shadow: var(--emvb-elevation-m);
}
.emvb-chip-option {
  display: flex; align-items: center; gap: 8px; min-height: var(--emvb-control); padding: 4px 8px;
  border-radius: 4px; font-size: 13px; cursor: pointer; color: var(--text-color-kumo-default);
}
.emvb-chip-option[aria-selected="true"] { background: var(--color-kumo-tint); }
.emvb-chip-option-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.emvb-chip-option-token { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--text-color-kumo-subtle); }
.emvb-chip-option-hint { padding: 4px 8px; font-size: 12px; line-height: 16px; color: var(--text-color-kumo-subtle); }

.emvb-site-styles { display: flex; flex-direction: column; gap: 8px; min-height: 0; height: 100%; }
.emvb-site-styles-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.emvb-site-styles-titles { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
.emvb-site-styles-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.emvb-site-styles-subtitle { margin: 0; font-size: 11px; color: var(--text-color-kumo-subtle); }
.emvb-site-styles-body { display: flex; flex-direction: column; gap: 10px; overflow: auto; min-height: 0; flex: 1 1 auto; }
.emvb-site-styles-footer { margin-top: auto; }
.emvb-site-section { display: flex; flex-direction: column; gap: 6px; }
.emvb-site-section-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.emvb-site-count {
  display: inline-flex; align-items: center; justify-content: center;
  margin-left: 6px; min-width: 18px; height: 18px; padding: 0 5px;
  border-radius: 999px; font-size: 11px; font-weight: 600;
  background: var(--color-kumo-tint); color: var(--text-color-kumo-default);
}
.emvb-site-elevated {
  padding: 8px; border-radius: 6px;
  background: var(--emvb-glass-elevated, var(--color-kumo-elevated));
  box-shadow: var(--emvb-elevation-s);
  border: 1px solid var(--color-kumo-hairline);
}
.emvb-site-create { display: flex; flex-direction: column; gap: 8px; }
.emvb-site-class-styles { display: flex; flex-direction: column; gap: 8px; }
.emvb-site-class-sections { display: flex; flex-wrap: wrap; gap: 4px; }
.emvb-site-class-section {
  height: 28px; padding: 0 8px; border: 0; border-radius: 4px;
  background: transparent; color: var(--text-color-kumo-subtle); font: inherit; font-size: 12px; cursor: pointer;
}
.emvb-site-class-section[aria-selected="true"] { background: var(--color-kumo-tint); color: var(--text-color-kumo-default); }
.emvb-site-class-section:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: -2px; }
.emvb-site-token { margin: 0; font-size: 11px; color: var(--text-color-kumo-subtle); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.emvb-site-cascade { margin: 0 0 4px; padding: 8px; border-radius: 6px; background: var(--color-kumo-tint); border: 1px solid var(--color-kumo-hairline); }
.emvb-unit-note { margin-left: 8px; font-size: 11px; color: var(--text-color-kumo-subtle); }
.emvb-site-usage { flex: 0 0 auto; white-space: nowrap; font-size: 11px; line-height: 16px; color: var(--text-color-kumo-subtle); font-variant-numeric: tabular-nums; }
/* Compact manager rows (W-087): one 32 px line per class or variable, details on demand */
.emvb-site-items {
  margin: 0; padding: 2px; list-style: none; display: flex; flex-direction: column; gap: 2px;
  border-radius: 6px; background: var(--emvb-glass-elevated, var(--color-kumo-elevated));
  box-shadow: var(--emvb-elevation-s);
}
.emvb-site-items:empty { display: none; }
.emvb-site-item { display: flex; flex-direction: column; border-radius: 4px; }
.emvb-site-item[data-open] { background: var(--color-kumo-tint); }
.emvb-site-item-row { display: flex; align-items: center; gap: 4px; min-height: 32px; padding: 2px; border-radius: 4px; }
.emvb-site-item-row:hover { background: var(--color-kumo-tint); }
.emvb-site-item-main {
  display: flex; align-items: center; gap: 8px; flex: 1 1 auto; min-width: 0; min-height: 28px; padding: 0 4px;
  border: 0; border-radius: 4px; background: transparent; color: var(--text-color-kumo-default);
  font: inherit; font-size: 13px; text-align: left; cursor: pointer;
}
.emvb-site-item-main[data-renaming] { cursor: default; }
.emvb-site-item-main:focus-visible, .emvb-site-menu-btn:focus-visible, .emvb-site-value-edit:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: -2px; }
.emvb-site-item-caret { flex: 0 0 auto; color: var(--text-color-kumo-subtle); }
.emvb-site-item-icon { flex: 0 0 auto; color: var(--text-color-kumo-subtle); }
.emvb-site-item-text { display: flex; flex-direction: column; min-width: 0; }
.emvb-site-item-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 16px; }
.emvb-site-item-text .emvb-site-token { line-height: 14px; }
.emvb-site-item-body { display: flex; flex-direction: column; gap: 8px; padding: 4px 8px 8px; }
.emvb-site-menu-btn {
  display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto;
  width: 28px; height: 28px; padding: 0; border: 0; border-radius: 4px;
  background: transparent; color: var(--text-color-kumo-subtle); cursor: pointer;
}
.emvb-site-menu-btn:hover, .emvb-site-menu-btn[data-popup-open] { background: var(--color-kumo-recessed); color: var(--text-color-kumo-default); }
.emvb-site-rename {
  flex: 1 1 auto; min-width: 0; height: 24px; padding: 0 6px; border: 0; border-radius: 4px; outline: 0;
  background: var(--color-kumo-base); color: var(--text-color-kumo-default); font: inherit; font-size: 13px;
  box-shadow: inset 0 0 0 1px var(--color-kumo-brand);
}
.emvb-site-empty-card { border-radius: 6px; border: 1px dashed var(--color-kumo-line); }
.emvb-site-empty {
  display: flex; align-items: flex-start; gap: 8px; margin: 0; padding: 8px;
  border-radius: 6px; border: 1px dashed var(--color-kumo-line);
  font-size: 12px; line-height: 16px; color: var(--text-color-kumo-subtle); text-wrap: pretty;
}
.emvb-site-empty svg { flex: 0 0 auto; }
.emvb-site-preview {
  display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto;
  width: 24px; height: 24px; overflow: hidden; border-radius: 4px;
  font-size: 13px; line-height: 1; color: var(--text-color-kumo-default);
}
.emvb-site-preview-color { box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--text-color-kumo-default) 18%, transparent); }
.emvb-site-preview-icon { color: var(--text-color-kumo-subtle); }
.emvb-site-bar {
  display: inline-block; height: 6px; margin-right: 6px; border-radius: 2px; vertical-align: 1px;
  background: color-mix(in oklab, var(--color-kumo-brand) 60%, transparent);
}
.emvb-site-value-row { display: flex; align-items: center; gap: 6px; }
.emvb-site-value-row .emvb-site-value-input { flex: 1 1 auto; min-width: 0; font-family: var(--font-mono); }
.emvb-site-picker {
  flex: 0 0 auto; width: 28px; height: 28px; padding: 2px; border: 0; border-radius: 6px;
  background: var(--color-kumo-control, var(--color-kumo-base)); box-shadow: inset 0 0 0 1px var(--color-kumo-line); cursor: pointer;
}
.emvb-site-picker::-webkit-color-swatch-wrapper { padding: 0; }
.emvb-site-picker::-webkit-color-swatch { border: 0; border-radius: 4px; }
.emvb-site-picker::-moz-color-swatch { border: 0; border-radius: 4px; }
.emvb-site-picker:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: 1px; }
.emvb-site-font-sample { margin: 0; font-size: 14px; line-height: 20px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-color-kumo-default); }
.emvb-site-empty-card p { text-wrap: pretty; }
.emvb-site-confirm {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--color-kumo-hairline);
  border-radius: 6px;
  background: var(--emvb-glass-elevated);
  -webkit-backdrop-filter: blur(var(--emvb-glass-blur));
  backdrop-filter: blur(var(--emvb-glass-blur));
  box-shadow: var(--emvb-elevation-s);
}

@media (prefers-reduced-transparency: reduce) {
  .emvb-topbar,
  .emvb-panel,
  .emvb-empty-prompt,
  .emvb-element-tile,
  .emvb-layer-menu-list,
  .emvb-media-dialog,
  .emvb-media-card,
  .emvb-icon-tile,
  .emvb-site-confirm,
  .emvb-invalid-label {
    background: var(--color-kumo-base);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
  .emvb-media-dialog,
  .emvb-site-confirm {
    background: var(--color-kumo-elevated);
  }
}
`;
