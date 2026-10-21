/**
 * Styles for the full-screen image editor (W-482, photocn layout in W-483). Kumo tokens only, so
 * dark mode follows. Spacing and sizes follow photocn's shadcn editor (MIT, Copyright (c) 2026
 * rbbydotdev): a 48 px toolbar, a 338 px resizable sidebar, 16 px panel padding, 44 px touch
 * targets in the compact layout.
 *
 * No color-mix() over Kumo tokens here: the tokens are light-dark() values, and Chromium kept a
 * color-mix() of them on the old scheme after the admin switched from dark to light (W-483 fix).
 */
export const IMAGE_EDITOR_CSS = `
.emvb-image-editor-popup.emvb-image-editor-popup {
  padding: 0; display: flex; overflow: hidden;
  width: 100vw; height: 100dvh; max-width: none; max-height: none;
  border-radius: 0; border: 0; inset: 0; translate: none; top: 0; left: 0;
}
.emvb-ie-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.emvb-ie {
  --emvb-ie-check-a: var(--color-kumo-recessed);
  --emvb-ie-check-b: var(--color-kumo-base);
  flex: 1; min-width: 0; min-height: 0; display: flex; height: 100%;
  color: var(--text-color-kumo-default); background: var(--color-kumo-base);
  font-size: 14px; line-height: 20px;
}
.emvb-ie button { font: inherit; }
.emvb-ie .emvb-ie-btn { height: 32px; border-radius: 8px; font-size: 13px; font-weight: 500; gap: 6px; }
.emvb-ie .emvb-ie-btn-icon { width: 32px; padding: 0; }
.emvb-ie .emvb-ie-btn svg { width: 16px; height: 16px; flex: none; }
.emvb-ie .emvb-ie-btn[aria-pressed="true"] { background: var(--color-kumo-tint); }

/* Desktop: toolbar on top, canvas and a resizable sidebar (photocn layout.tsx). */
.emvb-ie-layout { flex: 1; min-width: 0; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); }
.emvb-ie-toolbar {
  display: flex; align-items: center; gap: 8px; min-height: 48px; padding: 0 12px;
  border-bottom: 1px solid var(--color-kumo-hairline); background: var(--color-kumo-base);
}
.emvb-ie-toolbar-end { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.emvb-ie-file {
  display: inline-flex; align-items: baseline; gap: 8px; min-width: 0; max-width: 360px;
  height: 32px; line-height: 32px; padding: 0 10px; border-radius: 8px;
  border: 1px solid var(--color-kumo-hairline); font-size: 13px;
}
.emvb-ie-file-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.emvb-ie-file-size { flex: none; color: var(--text-color-kumo-subtle); font-size: 12px; font-variant-numeric: tabular-nums; }
.emvb-ie-badge { display: inline-flex; align-items: center; gap: 4px; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.emvb-ie-workspace { display: grid; min-height: 0; }
.emvb-ie-main { min-width: 0; min-height: 0; overflow: hidden; padding: 16px; background: var(--color-kumo-tint); }
.emvb-ie-main-solo { display: flex; }
.emvb-ie-resize {
  position: relative; z-index: 2; width: 0; cursor: col-resize; touch-action: none; outline: none;
}
.emvb-ie-resize::before { content: ""; position: absolute; inset: 0 -4px; }
.emvb-ie-resize > span {
  position: absolute; top: 50%; left: -6px; width: 12px; height: 16px; margin-top: -8px;
  border-radius: 3px; border: 1px solid var(--color-kumo-line); background: var(--color-kumo-tint);
}
.emvb-ie-resize > span::before, .emvb-ie-resize > span::after {
  content: ""; position: absolute; top: 4px; bottom: 4px; width: 1px; background: var(--text-color-kumo-subtle);
}
.emvb-ie-resize > span::before { left: 3px; }
.emvb-ie-resize > span::after { right: 3px; }
.emvb-ie-resize:focus-visible > span { outline: 2px solid var(--color-kumo-focus, var(--color-kumo-brand)); }
.emvb-ie-sidebar {
  min-width: 0; min-height: 0; overflow-x: hidden; overflow-y: auto;
  border-left: 1px solid var(--color-kumo-hairline); background: var(--color-kumo-base);
}
.emvb-ie-sidebar-tools { padding: 12px; border-bottom: 1px solid var(--color-kumo-hairline); }

/* Tool switcher: outlined icon toggles, the active one filled (photocn toolbar.tsx). */
.emvb-ie-switcher { display: flex; justify-content: space-between; gap: 4px; }
.emvb-ie-switch {
  flex: 1 1 0; min-width: 0; max-width: 40px; height: 32px; display: grid; place-items: center;
  border: 1px solid var(--color-kumo-line); border-radius: 8px; background: var(--color-kumo-base);
  color: var(--text-color-kumo-default); cursor: pointer; padding: 0;
}
.emvb-ie-switch svg { width: 16px; height: 16px; transition: transform 120ms ease; }
.emvb-ie-switch:hover { background: var(--color-kumo-tint); }
.emvb-ie-switch[aria-pressed="true"], .emvb-ie-switch[aria-pressed="true"]:hover {
  background: var(--color-kumo-brand); border-color: var(--color-kumo-brand); color: #fff;
  box-shadow: inset 0 1px 2px rgb(0 0 0 / 0.2);
}
.emvb-ie-switch[aria-pressed="true"] svg { transform: scale(1.1); }
.emvb-ie-switch:focus-visible { outline: 2px solid var(--color-kumo-focus, var(--color-kumo-brand)); outline-offset: 2px; }
.emvb-ie-switch:disabled { opacity: 0.5; cursor: default; }

.emvb-ie-histogram {
  display: flex; flex-direction: column; gap: 4px; padding: 8px 12px;
  border-bottom: 1px solid var(--color-kumo-hairline); background: var(--color-kumo-tint);
}
.emvb-ie-histogram-head {
  display: flex; justify-content: space-between; font-size: 10px; line-height: 14px;
  color: var(--text-color-kumo-subtle);
}
.emvb-ie-mono { font-family: var(--font-mono, ui-monospace, monospace); font-variant-numeric: tabular-nums; }
.emvb-ie-histogram canvas { display: block; width: 100%; height: 64px; border-radius: 4px; background: var(--color-kumo-base); }

/* Panels (photocn panel-header.tsx, crop-panel.tsx). */
.emvb-ie-panel { display: flex; flex-direction: column; min-width: 0; }
.emvb-ie-panel-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  min-height: 48px; padding: 0 16px; border-bottom: 1px solid var(--color-kumo-hairline);
}
.emvb-ie-panel-titles { min-width: 0; }
.emvb-ie-panel-titles h2 { margin: 0; font-size: 14px; line-height: 20px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.emvb-ie-panel-titles p { margin: 0; font-size: 12px; line-height: 16px; color: var(--text-color-kumo-subtle); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.emvb-ie-group { display: flex; flex-direction: column; gap: 20px; padding: 16px; margin: 0; border: 0; min-width: 0; }
.emvb-ie-group-tight { gap: 12px; }
.emvb-ie-sep { margin: 0; border: 0; border-top: 1px solid var(--color-kumo-hairline); }
.emvb-ie-row { display: flex; align-items: center; gap: 4px; min-width: 0; }
.emvb-ie-row-fill { gap: 8px; }
.emvb-ie-row-fill > :first-child { flex: 1; min-width: 0; }
.emvb-ie-row-between { justify-content: space-between; gap: 8px; }
.emvb-ie-vsep { width: 1px; height: 20px; margin: 0 4px; background: var(--color-kumo-hairline); }
.emvb-ie-field { display: flex; flex-direction: column; gap: 8px; }
.emvb-ie-label { padding: 0; font-size: 14px; line-height: 20px; font-weight: 500; }
.emvb-ie .emvb-ie-select { width: 100%; height: 32px; }

.emvb-ie-slider { display: flex; flex-direction: column; gap: 10px; }
.emvb-ie-slider[data-disabled] { opacity: 0.5; }
.emvb-ie-slider-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.emvb-ie-slider-head label { font-size: 14px; line-height: 20px; font-weight: 500; }
.emvb-ie-slider-value {
  border: 0; background: none; padding: 0 4px; border-radius: 4px; cursor: pointer;
  font-size: 12px; color: var(--text-color-kumo-subtle); font-variant-numeric: tabular-nums;
}
.emvb-ie-slider-value:hover { color: var(--text-color-kumo-default); }
.emvb-ie-slider-value:disabled { cursor: default; color: var(--text-color-kumo-subtle); }
.emvb-ie-slider input[type="range"] {
  -webkit-appearance: none; appearance: none; width: 100%; height: 16px; margin: 0; background: transparent; cursor: pointer;
}
.emvb-ie-slider input[type="range"]::-webkit-slider-runnable-track {
  height: 4px; border-radius: 9999px;
  background: linear-gradient(to right, var(--color-kumo-tint) var(--emvb-ie-from), var(--text-color-kumo-default) var(--emvb-ie-from) var(--emvb-ie-to), var(--color-kumo-tint) var(--emvb-ie-to));
}
.emvb-ie-slider input[type="range"]::-moz-range-track { height: 4px; border-radius: 9999px; background: var(--color-kumo-tint); }
.emvb-ie-slider input[type="range"]::-moz-range-progress { height: 4px; border-radius: 9999px; background: var(--text-color-kumo-default); }
.emvb-ie-slider input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 16px; height: 16px; margin-top: -6px; border-radius: 9999px;
  background: #fff; border: 1px solid var(--text-color-kumo-default); box-shadow: 0 1px 2px rgb(0 0 0 / 0.2);
}
.emvb-ie-slider input[type="range"]::-moz-range-thumb {
  width: 14px; height: 14px; border-radius: 9999px; background: #fff; border: 1px solid var(--text-color-kumo-default);
}
.emvb-ie-slider input[type="range"]:focus-visible { outline: none; }
.emvb-ie-slider input[type="range"]:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px var(--color-kumo-line); }

.emvb-ie .emvb-ie-done { width: 100%; }
.emvb-ie-shortcuts { font-size: 12px; line-height: 16px; color: var(--text-color-kumo-subtle); }
.emvb-ie-shortcuts summary { cursor: pointer; user-select: none; border-radius: 2px; }
.emvb-ie-shortcuts summary:hover { color: var(--text-color-kumo-default); }
.emvb-ie-shortcuts dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 8px 0 0; }
.emvb-ie-shortcuts dl > div { display: contents; }
.emvb-ie-shortcuts dd { margin: 0; }
.emvb-ie-shortcuts kbd, .emvb-ie kbd {
  display: inline-block; padding: 0 4px; border-radius: 4px; border: 1px solid var(--color-kumo-line);
  background: var(--color-kumo-tint); color: var(--text-color-kumo-default);
  font-family: var(--font-mono, ui-monospace, monospace); font-size: 11px; line-height: 16px;
}

.emvb-ie-soon {
  display: flex; gap: 12px; padding: 12px; border-radius: 10px;
  border: 1px dashed var(--color-kumo-line); background: var(--color-kumo-tint);
}
.emvb-ie-soon-icon {
  flex: none; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px;
  background: var(--color-kumo-base); border: 1px solid var(--color-kumo-hairline);
}
.emvb-ie-soon-icon svg { width: 16px; height: 16px; }
.emvb-ie-soon-title { display: flex; align-items: center; gap: 6px; margin: 0 0 6px; font-size: 13px; font-weight: 600; }
.emvb-ie-soon-title svg { width: 14px; height: 14px; color: var(--text-color-kumo-subtle); }
.emvb-ie-soon ul { margin: 0; padding-left: 16px; font-size: 12px; line-height: 18px; color: var(--text-color-kumo-subtle); }
.emvb-ie-note { margin: 0; font-size: 12px; line-height: 16px; color: var(--text-color-kumo-subtle); }

/* The stage (photocn canvas.tsx): rounded, bordered, a checkerboard behind the photo. */
.emvb-ie-canvas { position: relative; height: 100%; min-height: 0; }
.emvb-ie-stage {
  position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: 8px;
  border: 1px solid var(--color-kumo-hairline); touch-action: none; user-select: none;
  background-color: var(--emvb-ie-check-b);
  background-image: conic-gradient(var(--emvb-ie-check-a) 25%, transparent 0 50%, var(--emvb-ie-check-a) 0 75%, transparent 0);
  background-size: 16px 16px;
}
.emvb-ie-stage-message { display: grid; place-items: center; }
.emvb-ie-canvas-el { position: absolute; display: block; pointer-events: none; }
.emvb-ie-loading { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; color: var(--text-color-kumo-subtle); }
.emvb-ie-loading svg { width: 20px; height: 20px; animation: emvb-ie-spin 0.9s linear infinite; }
.emvb-ie-spinner {
  width: 20px; height: 20px; border-radius: 9999px; border: 2px solid var(--color-kumo-line);
  border-top-color: var(--text-color-kumo-default); animation: emvb-ie-spin 0.9s linear infinite;
}
@keyframes emvb-ie-spin { to { transform: rotate(360deg); } }
.emvb-ie .emvb-ie-compact-note { padding: 4px 12px; }
.emvb-ie .emvb-ie-recipe-error { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--color-kumo-danger); }
.emvb-ie .emvb-ie-zoom { position: absolute; right: 8px; bottom: 8px; display: flex; gap: 4px; padding: 4px; border-radius: 10px; background: var(--color-kumo-base); box-shadow: 0 1px 3px var(--color-kumo-shadow-drop, rgb(0 0 0 / 0.15)); }
.emvb-ie-error {
  display: flex; flex-direction: column; align-items: center; gap: 8px; max-width: 420px; margin: 24px;
  padding: 20px 24px; border-radius: 12px; text-align: center;
  border: 1px solid var(--color-kumo-line); background: var(--color-kumo-base);
  box-shadow: 0 8px 24px var(--color-kumo-shadow-drop, rgb(0 0 0 / 0.12));
}
.emvb-ie-error h3 { margin: 0; font-size: 14px; font-weight: 600; }
.emvb-ie-error p { margin: 0 0 4px; font-size: 13px; color: var(--text-color-kumo-subtle); }
.emvb-ie-error-icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 9999px; color: var(--text-color-kumo-danger); background: var(--color-kumo-danger-tint); }
.emvb-ie-error-icon svg { width: 20px; height: 20px; }

/* Crop overlay (photocn crop-overlay.tsx). */
.emvb-ie-crop { position: absolute; inset: 0; }
.emvb-ie-crop-mask, .emvb-ie-corner-outline { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.emvb-ie-crop-mask path { fill: rgb(0 0 0 / 0.55); }
.emvb-ie-corner-outline polygon { fill: none; stroke: rgb(255 255 255 / 0.9); }
.emvb-ie-crop-frame {
  position: absolute; touch-action: none; cursor: move;
  outline: 1px solid rgb(255 255 255 / 0.9); outline-offset: -1px; box-shadow: 0 0 0 1px rgb(0 0 0 / 0.35);
}
.emvb-ie-crop-frame[data-disabled] { pointer-events: none; }
.emvb-ie-crop-frame:focus-visible { outline: 2px solid var(--color-kumo-focus, var(--color-kumo-brand)); outline-offset: 2px; }
.emvb-ie-crop-thirds { position: absolute; inset: 0; pointer-events: none; }
.emvb-ie-crop-thirds i { position: absolute; top: 0; bottom: 0; width: 1px; background: rgb(255 255 255 / 0.4); }
.emvb-ie-crop-thirds b { position: absolute; left: 0; right: 0; height: 1px; background: rgb(255 255 255 / 0.4); }
.emvb-ie-crop-handle, .emvb-ie-corner-handle {
  position: absolute; z-index: 1; display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; translate: -50% -50%; padding: 0; border: 0; border-radius: 9999px;
  background: transparent; outline: none; touch-action: none;
}
.emvb-ie-crop-handle:focus-visible, .emvb-ie-corner-handle:focus-visible { box-shadow: 0 0 0 2px var(--color-kumo-focus, var(--color-kumo-brand)); }
.emvb-ie-crop-handle > span { display: block; width: 10px; height: 10px; border-radius: 9999px; background: #fff; border: 1px solid rgb(0 0 0 / 0.3); box-shadow: 0 1px 3px rgb(0 0 0 / 0.3); }
.emvb-ie-crop-handle[data-handle="nw"] > span, .emvb-ie-crop-handle[data-handle="ne"] > span,
.emvb-ie-crop-handle[data-handle="sw"] > span, .emvb-ie-crop-handle[data-handle="se"] > span { width: 14px; height: 14px; }
.emvb-ie-crop-handle[data-handle="nw"] { left: 0; top: 0; cursor: nwse-resize; }
.emvb-ie-crop-handle[data-handle="n"] { left: 50%; top: 0; cursor: ns-resize; }
.emvb-ie-crop-handle[data-handle="ne"] { left: 100%; top: 0; cursor: nesw-resize; }
.emvb-ie-crop-handle[data-handle="e"] { left: 100%; top: 50%; cursor: ew-resize; }
.emvb-ie-crop-handle[data-handle="se"] { left: 100%; top: 100%; cursor: nwse-resize; }
.emvb-ie-crop-handle[data-handle="s"] { left: 50%; top: 100%; cursor: ns-resize; }
.emvb-ie-crop-handle[data-handle="sw"] { left: 0; top: 100%; cursor: nesw-resize; }
.emvb-ie-crop-handle[data-handle="w"] { left: 0; top: 50%; cursor: ew-resize; }
.emvb-ie-corner-handle { width: 36px; height: 36px; cursor: grab; }
.emvb-ie-corner-handle:active { cursor: grabbing; }
.emvb-ie-corner-handle > span { display: block; width: 16px; height: 16px; border-radius: 9999px; border: 2px solid #fff; background: var(--color-kumo-brand); box-shadow: 0 1px 3px rgb(0 0 0 / 0.3); }
@media (pointer: coarse) {
  .emvb-ie-crop-handle { width: 44px; height: 44px; }
  .emvb-ie-corner-handle { width: 48px; height: 48px; }
}

/* Compact (phone) layout (photocn compact-layout.tsx). */
.emvb-ie-compact { position: relative; flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.emvb-ie-compact-head {
  display: flex; align-items: center; gap: 4px; height: 48px; flex: none; padding: 0 8px;
  padding-top: env(safe-area-inset-top); border-bottom: 1px solid var(--color-kumo-hairline);
}
.emvb-ie-compact-head .emvb-ie-toolbar-end { gap: 4px; }
.emvb-ie .emvb-ie-touch { width: 44px; height: 44px; }
.emvb-ie-compact-canvas { flex: 1; min-height: 0; padding: 8px; }
.emvb-ie-compact-tools {
  display: flex; flex: none; gap: 4px; overflow-x: auto; scrollbar-width: none;
  padding: 4px 8px max(4px, env(safe-area-inset-bottom)); border-top: 1px solid var(--color-kumo-hairline);
}
.emvb-ie-compact-tools-inline { flex: 1; border-top: 0; padding-bottom: 0; }
.emvb-ie-compact-tool {
  display: flex; flex: none; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  min-width: 56px; min-height: 44px; padding: 0 8px; border: 0; border-radius: 10px; background: none;
  color: var(--text-color-kumo-subtle); font-size: 11px; line-height: 14px; cursor: pointer;
}
.emvb-ie-compact-tool svg { width: 20px; height: 20px; }
.emvb-ie-compact-tool[aria-pressed="true"] { background: var(--color-kumo-brand); color: #fff; box-shadow: inset 0 1px 2px rgb(0 0 0 / 0.2); }
.emvb-ie-compact-tool[aria-pressed="true"] svg { transform: scale(1.1); }
.emvb-ie-compact-tool:focus-visible { outline: 2px solid var(--color-kumo-focus, var(--color-kumo-brand)); }
.emvb-ie-compact-tool:disabled { opacity: 0.5; }
.emvb-ie-sheet {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 40; display: flex; flex-direction: column;
  border-radius: 14px 14px 0 0; border-top: 1px solid var(--color-kumo-line);
  background: var(--color-kumo-elevated); box-shadow: 0 -8px 24px var(--color-kumo-shadow-drop, rgb(0 0 0 / 0.15));
  transition: transform 200ms ease-out; transform: translateY(100%); pointer-events: none;
}
.emvb-ie-sheet[data-open] { transform: none; pointer-events: auto; }
.emvb-ie-sheet[data-dragging] { transition: none; }
.emvb-ie-sheet-grip { display: flex; align-items: center; justify-content: center; height: 24px; flex: none; cursor: grab; touch-action: none; }
.emvb-ie-sheet-grip:focus-visible { outline: none; }
.emvb-ie-sheet-grip:focus-visible > span { outline: 2px solid var(--color-kumo-focus, var(--color-kumo-brand)); outline-offset: 2px; }
.emvb-ie-sheet-grip > span { width: 48px; height: 6px; border-radius: 9999px; background: var(--color-kumo-line); }
.emvb-ie-sheet-tools { display: flex; align-items: center; gap: 4px; padding: 0 8px 4px; border-bottom: 1px solid var(--color-kumo-hairline); }
.emvb-ie-sheet-body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-bottom: env(safe-area-inset-bottom); }
/* Tone panels (W-484; photocn adjustments-panel, filters-panel, curves-panel, blur-panel). */
.emvb-ie-tabs-wrap { padding: 12px 16px; }
/* W-872: Kumo's small tab list has a fixed 26px height, but an icon-and-text tab is taller, so the
   underline (bottom: 0 of the list) cut through the label. The list now grows to its tabs. */
.emvb-ie-tabs [role="tablist"] { width: 100%; height: auto; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; }
.emvb-ie-tabs [role="tab"] { justify-content: center; font-size: 13px; }
.emvb-ie-tab-label { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.emvb-ie-tab-label svg { width: 16px; height: 16px; }
.emvb-ie-dot { display: inline-block; width: 8px; height: 8px; border-radius: 9999px; }
.emvb-ie-dot[data-channel="rgb"] { background: var(--text-color-kumo-default) !important; }
.emvb-ie-group-sliders { gap: 16px; }
.emvb-ie-section-head { align-items: flex-start; }
.emvb-ie-section-titles { display: flex; flex-direction: column; min-width: 0; }
.emvb-ie-section-title { font-size: 14px; line-height: 20px; font-weight: 500; }
.emvb-ie-section-desc { font-size: 13px; line-height: 18px; color: var(--text-color-kumo-subtle); }
.emvb-ie-number {
  width: 64px; height: 22px; margin: 0 -4px 0 0; padding: 0 4px; text-align: right; border-radius: 4px;
  border: 1px solid transparent; background: transparent; color: var(--text-color-kumo-subtle);
  font: inherit; font-size: 12px; font-variant-numeric: tabular-nums;
}
.emvb-ie-number:hover:not(:disabled) { border-color: var(--color-kumo-line); }
.emvb-ie-number:focus { outline: none; border-color: var(--color-kumo-brand); color: var(--text-color-kumo-default); background: var(--color-kumo-base); }
.emvb-ie-chips { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.emvb-ie .emvb-ie-chip { width: 100%; min-width: 0; height: 36px; padding: 0 8px; font-size: 12px; justify-content: center; text-transform: capitalize; }
.emvb-ie .emvb-ie-chip[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--color-kumo-line); }
.emvb-ie-spin { animation: emvb-ie-spin 0.9s linear infinite; }
.emvb-ie-subgroup { display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 0; border: 0; min-width: 0; }
.emvb-ie-caps { padding: 0; margin-bottom: 0; font-size: 12px; line-height: 16px; font-weight: 600; color: var(--text-color-kumo-subtle); }
.emvb-ie-group-curves { gap: 12px; }
.emvb-ie-curves { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.emvb-ie-curves-box {
  position: relative; overflow: hidden; border-radius: 6px; border: 1px solid var(--color-kumo-hairline);
  background: var(--color-kumo-tint); color: var(--text-color-kumo-default);
}
.emvb-ie-curves-box canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.emvb-ie-curves-box svg { position: relative; display: block; touch-action: none; }
.emvb-ie-curves-box svg[data-disabled] { pointer-events: none; opacity: 0.6; }
.emvb-ie-curve-point { fill: var(--color-kumo-base); outline: none; }
.emvb-ie-curve-point:focus-visible, .emvb-ie-curve-point[data-selected] { stroke-width: 3px; }
.emvb-ie-curve-point:focus-visible { filter: drop-shadow(0 0 2px var(--color-kumo-brand)); }
.emvb-ie-hint { margin: 0; max-width: 260px; text-align: center; font-size: 12px; line-height: 16px; color: var(--text-color-kumo-subtle); }
.emvb-ie-hint-keys { display: block; margin-top: 4px; }
.emvb-ie-hint kbd { font-size: 10px; line-height: 14px; }
.emvb-ie-point-fields { display: flex; justify-content: center; gap: 16px; }
.emvb-ie-level { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-color-kumo-subtle); }
.emvb-ie-level input {
  width: 56px; height: 28px; padding: 0 6px; border-radius: 6px; border: 1px solid var(--color-kumo-line);
  background: var(--color-kumo-base); color: var(--text-color-kumo-default); font: inherit; font-size: 12px; font-variant-numeric: tabular-nums;
}
.emvb-ie-level input:focus { outline: 2px solid var(--color-kumo-brand); outline-offset: -1px; }
.emvb-ie-overlay-box { position: absolute; }
.emvb-ie-blur-focus { position: absolute; inset: 0; cursor: crosshair; touch-action: none; }
.emvb-ie-blur-focus[data-disabled] { pointer-events: none; }
.emvb-ie-blur-handle {
  position: absolute; width: 24px; height: 24px; translate: -50% -50%; border-radius: 9999px;
  border: 2px solid rgb(255 255 255 / 0.9); background: rgb(255 255 255 / 0.1);
  box-shadow: 0 0 0 2px rgb(0 0 0 / 0.5); outline: none; transition: scale 120ms ease;
}
.emvb-ie-blur-handle > span { position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; translate: -50% -50%; border-radius: 9999px; background: #fff; }
.emvb-ie-blur-handle[data-dragging] { scale: 1.15; }
.emvb-ie-blur-handle:focus-visible { box-shadow: 0 0 0 2px rgb(0 0 0 / 0.5), 0 0 0 5px var(--color-kumo-brand); }
@media (pointer: coarse) { .emvb-ie-blur-handle { width: 32px; height: 32px; } }
@media (prefers-reduced-motion: reduce) {
  .emvb-ie-sheet, .emvb-ie-compact-canvas, .emvb-ie-switch, .emvb-ie-switch svg, .emvb-ie-blur-handle { transition: none; }
}
/* W-487: no motion at all when the system asks for less, Kumo's own transitions included. */
@media (prefers-reduced-motion: reduce) {
  .emvb-ie, .emvb-ie *, .emvb-ie-export, .emvb-ie-export * { transition-duration: 0s !important; animation-duration: 0s !important; }
}
.emvb-ie-meta-edits { margin: 0; font-size: 13px; line-height: 20px; display: flex; gap: 8px; }
.emvb-ie-meta-edits > .emvb-ie-subtle { flex: 0 0 112px; padding-left: 8px; }
/* W-485 export dialog (photocn export-dialog.tsx; a bottom sheet on phones like its drawer). */
.emvb-ie-scrim { position: fixed; inset: 0; z-index: 1; background: rgb(0 0 0 / 0.25); backdrop-filter: blur(4px); }

.emvb-ie-export.emvb-ie-export { width: min(448px, calc(100vw - 32px)); padding: 0; overflow: hidden; border-radius: 12px; }
.emvb-ie.emvb-ie-export-body { display: flex; flex-direction: column; gap: 16px; height: auto; padding: 16px 16px 0; background: transparent; }
.emvb-ie-export-head { position: relative; display: flex; flex-direction: column; gap: 4px; padding-right: 32px; }
.emvb-ie .emvb-ie-export-close { position: absolute; top: -6px; right: -6px; }
.emvb-ie-export-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.emvb-ie-export-desc { margin: 0; font-size: 14px; color: var(--text-color-kumo-subtle); }
.emvb-ie-export-fields { display: flex; flex-direction: column; gap: 16px; }
.emvb-ie-export-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.emvb-ie .emvb-ie-export-format { width: 200px; flex: none; }
.emvb-ie-export-size { display: flex; flex-direction: column; gap: 8px; }
.emvb-ie-export-dims { display: flex; align-items: center; gap: 8px; color: var(--text-color-kumo-subtle); font-size: 12px; }
.emvb-ie .emvb-ie-export-px {
  width: 96px; height: 32px; padding: 0 10px; text-align: left; font-size: 14px;
  border: 1px solid var(--color-kumo-line); border-radius: 8px; background: transparent; color: var(--text-color-kumo-default);
}
.emvb-ie-subtle { margin: 0; font-size: 12px; color: var(--text-color-kumo-subtle); font-variant-numeric: tabular-nums; }
.emvb-ie .emvb-ie-link { border: 0; background: none; padding: 0; font-size: 12px; color: var(--text-color-kumo-subtle); cursor: pointer; }
.emvb-ie .emvb-ie-link:hover { color: var(--text-color-kumo-default); text-decoration: underline; }
.emvb-ie-alert { display: flex; gap: 8px; align-items: flex-start; padding: 10px 12px; border-radius: 8px; font-size: 13px; color: var(--text-color-kumo-danger); background: var(--color-kumo-danger-tint); }
.emvb-ie-alert svg { width: 16px; height: 16px; flex: none; margin-top: 2px; }
.emvb-ie-export-actions {
  display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap;
  margin: 0 -16px; padding: 12px 16px; border-top: 1px solid var(--color-kumo-hairline); background: var(--color-kumo-recessed);
}
.emvb-ie-spinner.emvb-ie-spinner-sm { width: 14px; height: 14px; }
@media (max-width: 767px) {
  .emvb-ie-export.emvb-ie-export {
    width: 100vw; max-width: none; top: auto; bottom: 0; left: 0; translate: none;
    border-radius: 16px 16px 0 0;
  }
  .emvb-ie-export-head { text-align: center; padding: 8px 32px 0; }
  .emvb-ie-export-actions { flex-direction: column-reverse; border-top: 0; background: transparent; padding-bottom: max(16px, env(safe-area-inset-bottom)); }
  .emvb-ie-export-actions > * { width: 100%; height: 40px; }
}
/* W-486 Metadata panel (photocn metadata-panel.tsx: p-3, gap-3, a w-28 label column, text-xs). */
.emvb-ie-meta { display: flex; flex-direction: column; gap: 12px; padding: 12px; }
.emvb-ie-meta-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.emvb-ie-meta-head h2 { margin: 0; font-size: 14px; line-height: 20px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.emvb-ie-rule { margin: 0; height: 1px; border: 0; background: var(--color-kumo-hairline); }
.emvb-ie-meta-table { width: 100%; border-collapse: collapse; font-size: 12px; line-height: 16px; }
.emvb-ie-meta-table tr { border-bottom: 1px solid var(--color-kumo-hairline); }
.emvb-ie-meta-table tr:last-child { border-bottom: 0; }
.emvb-ie-meta-table th { width: 112px; padding: 8px; text-align: left; vertical-align: top; font-weight: 400; color: var(--text-color-kumo-subtle); }
.emvb-ie-meta-table td { padding: 8px; overflow-wrap: anywhere; color: var(--text-color-kumo-default); }
.emvb-ie-alert.emvb-ie-alert-neutral { color: var(--text-color-kumo-default); background: var(--color-kumo-recessed); }
.emvb-ie-meta-gps { display: flex; gap: 8px; margin: 0; padding: 10px 12px; border-radius: 8px; font-size: 12px; line-height: 16px; color: var(--text-color-kumo-default); background: var(--color-kumo-recessed); }
.emvb-ie-meta-gps svg { width: 16px; height: 16px; flex: none; color: var(--text-color-kumo-default); }
`;
