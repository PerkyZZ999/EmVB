/**
 * Editor chrome styles (DESIGN.md). The admin's Tailwind build is precompiled, so EmVB ships its
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
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  min-width: 0;
  background: var(--emvb-glass);
  -webkit-backdrop-filter: blur(var(--emvb-glass-blur));
  backdrop-filter: blur(var(--emvb-glass-blur));
  border-bottom: 1px solid var(--color-kumo-hairline);
  box-shadow: 0 1px 0 var(--color-kumo-shadow-edge), 0 1px 2px var(--color-kumo-shadow-drop);
  z-index: 1;
}
.emvb-topbar-title { font-size: 14px; line-height: 18px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.emvb-topbar-start { display: flex; align-items: center; gap: 8px; min-width: 0; }
.emvb-topbar-end { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
.emvb-topbar-tools { display: flex; align-items: center; gap: 2px; }
.emvb-topbar-actions { display: flex; align-items: center; gap: 8px; margin-left: 8px; padding-left: 8px; border-left: 1px solid var(--color-kumo-hairline); }
.emvb-save-status { display: flex; align-items: center; gap: 4px; font-size: 12px; line-height: 16px; color: var(--text-color-kumo-subtle); white-space: nowrap; }
.emvb-danger-icon { color: var(--color-kumo-danger); }
.emvb-link-button { border: 0; padding: 0; background: none; color: var(--text-color-kumo-default); font: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; }
.emvb-save-button { position: relative; }
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
  min-height: 32px;
  gap: 0;
  padding-bottom: 0;
  margin-bottom: 2px;
  border-bottom: 1px solid var(--color-kumo-hairline);
}
.emvb-tabs [role="tab"] {
  flex: 1 1 0;
  justify-content: center;
  gap: 4px;
  height: 32px;
  min-height: 32px;
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
.emvb-swatch { display: inline-block; width: 12px; height: 12px; margin-right: 6px; border-radius: 2px; box-shadow: inset 0 0 0 1px var(--color-kumo-line); vertical-align: -1px; }
.emvb-row-actions, .emvb-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
.emvb-dialog { display: flex; flex-direction: column; gap: 8px; }
.emvb-layers { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 1px; }
.emvb-layer-row { display: flex; align-items: center; gap: 6px; width: 100%; height: var(--emvb-control); padding-right: 4px; border-radius: 6px; color: var(--text-color-kumo-default); font-size: 13px; }
.emvb-layer-select { display: flex; align-items: center; gap: 6px; flex: 1 1 auto; min-width: 0; height: var(--emvb-control); padding: 0 4px 0 0; border: 0; border-radius: 6px; background: transparent; color: inherit; font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.emvb-layer-row:hover, .emvb-layer-row:hover .emvb-layer-select { background: var(--color-kumo-tint); }
.emvb-layers:empty::after, .emvb-panel-body > .emvb-helper { color: var(--text-color-kumo-subtle); }
.emvb-layer-select[aria-current="true"] { background: var(--color-kumo-brand); color: #fff; }
.emvb-layer-select:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: -2px; }
.emvb-layer-select[aria-current="true"]:focus-visible { outline-color: #fff; }
.emvb-layer-preview { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-color-kumo-subtle); }
.emvb-layer-select[aria-current="true"] .emvb-layer-preview { color: inherit; }
.emvb-canvas { min-width: 0; min-height: 0; background: var(--color-kumo-canvas); }
.emvb-stage { position: relative; width: 100%; height: 100%; overflow: hidden; }
.emvb-canvas iframe { display: block; width: 100%; height: 100%; border: 0; background: #fff; }
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
  pointer-events: auto;
}
.emvb-overlay-label > span { padding: 0 4px; }
.emvb-overlay-action { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: inherit; cursor: pointer; }
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
  transition: border-color 100ms ease, box-shadow 100ms ease, color 100ms ease, background-color 100ms ease;
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
@media (prefers-reduced-motion: reduce) {
  .emvb-element-tile { transition: none; }
}
.emvb-drop-line { position: absolute; background: var(--color-kumo-brand); pointer-events: none; z-index: 2; }

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

.emvb-element-header { display: flex; align-items: center; gap: 8px; }
.emvb-element-header svg { color: var(--color-kumo-brand); flex: 0 0 auto; }
.emvb-breadcrumb { margin: 0; font-size: 12px; line-height: 16px; color: var(--text-color-kumo-subtle); }
.emvb-breadcrumb-part { border: 0; padding: 0; background: none; color: inherit; font: inherit; cursor: pointer; text-decoration: none; border-radius: 2px; }
.emvb-breadcrumb-part:hover { color: var(--text-color-kumo-default); text-decoration: underline; text-underline-offset: 2px; }
.emvb-breadcrumb-part:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: 2px; }
.emvb-style-row { display: flex; align-items: flex-start; gap: 4px; }
.emvb-style-row > :first-child { flex: 1 1 auto; min-width: 0; }
.emvb-style-row[data-set="true"] .emvb-reset-btn { opacity: 1; }
.emvb-reset-btn { flex: 0 0 auto; margin-top: 20px; opacity: 0.4; }
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

.emvb-class-picker { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
.emvb-class-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.emvb-class-row { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border: 1px solid var(--color-kumo-hairline); border-radius: 6px; background: var(--emvb-glass-strong); min-height: var(--emvb-control); }
.emvb-class-name { flex: 1 1 auto; min-width: 0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.emvb-class-token { font-size: 11px; color: var(--text-color-kumo-subtle); }
.emvb-class-actions { display: flex; gap: 2px; flex: 0 0 auto; }

.emvb-site-styles { display: flex; flex-direction: column; gap: 8px; min-height: 0; }
.emvb-site-styles-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.emvb-site-styles-body { display: flex; flex-direction: column; gap: 12px; overflow: auto; min-height: 0; flex: 1 1 auto; }
.emvb-site-styles-footer { margin-top: auto; }
.emvb-site-section { display: flex; flex-direction: column; gap: 8px; }
.emvb-site-section-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.emvb-site-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.emvb-site-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px; }
.emvb-site-row > :first-child { flex: 1 1 120px; min-width: 0; }
.emvb-site-create { display: flex; flex-direction: column; gap: 8px; padding: 8px; border: 1px solid var(--color-kumo-hairline); border-radius: 6px; }
.emvb-site-class { display: flex; flex-direction: column; gap: 8px; padding: 8px; border: 1px solid var(--color-kumo-hairline); border-radius: 6px; }
.emvb-site-class-styles { display: flex; flex-direction: column; gap: 8px; }
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
  .emvb-class-row,
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
