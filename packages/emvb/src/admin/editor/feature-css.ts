/**
 * Editor styles for the W-307 feature batch (bindings, palette, meters, timeline…), kept apart
 * from the core chrome in editor-css.ts. Kumo variables only.
 */
export const FEATURE_CSS = `
.emvb-native-input {
  height: var(--emvb-control, 28px);
  min-width: 0;
  padding: 0 8px;
  border: 1px solid var(--color-kumo-line);
  border-radius: 6px;
  background: var(--color-kumo-base);
  color: var(--text-color-kumo-default);
  font: inherit;
}
.emvb-native-input:focus-visible {
  outline: 2px solid var(--color-kumo-brand);
  outline-offset: 1px;
}
.emvb-bind { display: grid; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-kumo-hairline); }
.emvb-bind-title { margin: 0; font-size: 13px; line-height: 18px; font-weight: 600; }
.emvb-bind-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 6px; align-items: center; }
.emvb-bind-row > .emvb-bind-label { grid-column: 1 / -1; font-size: 12px; color: var(--text-color-kumo-subtle); }
.emvb-bind-row > .emvb-panel-select:last-child { grid-column: 1 / -1; }
.emvb-bind-live { grid-column: 1 / -1; margin: 0; font-size: 12px; color: var(--text-color-kumo-default); overflow-wrap: anywhere; }
.emvb-bind-live > b { font-weight: 600; }
.emvb-bind-outside { grid-column: 1 / -1; display: grid; gap: 4px; }
.emvb-bind-outside > label { display: flex; gap: 6px; align-items: center; font-size: 12px; }
.emvb-bind-warning { margin: 0; padding: 6px 8px; border-radius: 6px; font-size: 12px; background: var(--color-kumo-warning-tint); color: var(--text-color-kumo-default); }
.emvb-js-badge { margin-left: auto; padding: 0 4px; border-radius: 4px; font-size: 10px; font-weight: 700; line-height: 16px; background: var(--color-kumo-warning-tint); color: var(--text-color-kumo-default); }
.emvb-element-tile { position: relative; }
.emvb-element-tile > .emvb-js-badge { position: absolute; top: 4px; right: 4px; }
.emvb-perf-bars { display: grid; gap: 8px; margin: 12px 0; padding: 0; list-style: none; }
/* UX-083: rows share one grid, so every bar starts and ends at the same place. */
.emvb-perf-bars { grid-template-columns: 90px minmax(0, 1fr) max-content; column-gap: 8px; }
.emvb-perf-bars > li { display: grid; grid-column: 1 / -1; grid-template-columns: subgrid; align-items: center; font-size: 13px; }
.emvb-perf-bar { display: block; height: 8px; border-radius: 4px; background: var(--color-kumo-tint); overflow: hidden; }
.emvb-perf-bar > span { display: block; height: 100%; background: var(--color-kumo-brand); }
.emvb-perf-bars > li[data-over] .emvb-perf-bar > span { background: var(--color-kumo-danger); }
.emvb-perf-value { font-variant-numeric: tabular-nums; color: var(--text-color-kumo-subtle); }
.emvb-perf-warnings { margin: 8px 0; padding-left: 18px; font-size: 13px; }
.emvb-perf-heading { margin: 12px 0 4px; font-size: 13px; font-weight: 600; }
.emvb-perf-sections { margin: 0 0 8px; padding-left: 18px; font-size: 13px; }
.emvb-topbar-meter { font-variant-numeric: tabular-nums; font-size: 12px; }
.emvb-js-badge + .emvb-ab-badge { margin-left: 2px; }
.emvb-ab-badge { background: var(--color-kumo-info-tint); }
.emvb-aud-checks { display: flex; flex-wrap: wrap; gap: 4px 10px; margin: 0; padding: 0; border: 0; font-size: 12px; }
.emvb-aud-checks > legend { width: 100%; padding: 0; margin-bottom: 2px; }
.emvb-palette { padding: 0; overflow: hidden; }
/* UX-093: anchored near the top, so the box doesn't jump up and down as results filter. */
.emvb-palette.emvb-palette { top: max(12vh, 32px); translate: -50% 0; }
.emvb-palette-input { width: 100%; height: 44px; padding: 0 16px; border: 0; border-bottom: 1px solid var(--color-kumo-line); background: transparent; color: var(--text-color-kumo-default); font: inherit; font-size: 15px; outline: none; }
.emvb-palette-list { max-height: min(60vh, 420px); overflow-y: auto; margin: 0; padding: 4px; list-style: none; }
.emvb-palette-group { padding: 8px 10px 2px; font-size: 12px; line-height: 16px; font-weight: 600; color: var(--text-color-kumo-subtle); }
.emvb-palette-item { display: flex; justify-content: space-between; gap: 12px; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.emvb-palette-item[aria-selected="true"] { background: var(--color-kumo-tint); }
.emvb-palette-hint { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 50%; color: var(--text-color-kumo-subtle); font-size: 12px; white-space: nowrap; }
.emvb-palette-kind { flex: none; padding: 0 6px; border-radius: 4px; line-height: 18px; background: var(--color-kumo-base); box-shadow: inset 0 0 0 1px var(--color-kumo-line); color: var(--text-color-kumo-default); }
.emvb-palette-detail { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.emvb-palette-empty { padding: 12px; color: var(--text-color-kumo-subtle); font-size: 13px; }
.emvb-palette-tips { margin: 0; padding: 6px 12px; border-top: 1px solid var(--color-kumo-line); font-size: 12px; line-height: 18px; color: var(--text-color-kumo-subtle); }
.emvb-palette-tips kbd { display: inline-block; min-width: 18px; padding: 0 4px; border-radius: 4px; box-shadow: inset 0 0 0 1px var(--color-kumo-line); font-family: var(--font-mono); font-size: 11px; line-height: 16px; text-align: center; color: var(--text-color-kumo-default); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.emvb-timeline-error { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.emvb-timeline-body { display: grid; grid-template-columns: 220px 1fr; gap: 16px; margin: 12px 0; min-height: 0; }
.emvb-timeline-list { margin: 0; padding: 0; list-style: none; max-height: 60vh; overflow-y: auto; }
.emvb-timeline-list { display: grid; gap: 2px; padding-inline-end: 4px; }
.emvb-timeline-version { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 6px 10px; border: 0; border-radius: 8px; background: transparent; color: var(--text-color-kumo-default); font: inherit; font-size: 13px; line-height: 18px; text-align: start; cursor: pointer; }
.emvb-timeline-version:hover { background: var(--color-kumo-tint); }
.emvb-timeline-version:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: -2px; }
.emvb-timeline-when { display: grid; min-width: 0; }
.emvb-timeline-time { color: var(--text-color-kumo-subtle); font-size: 12px; font-weight: 400; font-variant-numeric: tabular-nums; }
.emvb-timeline-version[aria-current="true"] { background: var(--color-kumo-base); box-shadow: var(--shadow-sm); outline: 1px solid var(--color-kumo-line); font-weight: 600; }
.emvb-timeline-agent { display: inline-flex; flex: none; align-items: center; gap: 3px; padding: 1px 7px 1px 5px; border: 1px solid var(--color-kumo-line); border-radius: 999px; background: var(--color-kumo-base); color: var(--text-color-kumo-default); font-size: 11px; line-height: 16px; font-weight: 600; }
/* W-477: a themed card under the top bar, centred over the canvas so it never hides the inspector. */
.emvb-remote-change { position: fixed; inset-block-start: 96px; inset-inline-start: 50%; transform: translateX(-50%); z-index: 50; display: flex; align-items: center; gap: 12px; max-width: min(560px, calc(100vw - 32px)); padding: 10px 10px 10px 12px; border: 1px solid var(--color-kumo-line); border-radius: 12px; background: var(--color-kumo-base); color: var(--text-color-kumo-default); box-shadow: var(--shadow-lg); font-size: 13px; line-height: 18px; }
.emvb-remote-change-icon { display: grid; flex: none; place-items: center; width: 32px; height: 32px; border-radius: 999px; background: var(--color-kumo-tint); color: var(--text-color-kumo-brand, var(--text-color-kumo-default)); }
.emvb-remote-change-text { display: grid; min-width: 0; }
.emvb-remote-change-text strong { font-weight: 600; }
.emvb-remote-change-text span { color: var(--text-color-kumo-subtle); }
/* W-477: All | People | Agents as the editor's segmented control (Kumo Tabs "segmented" look). */
.emvb-timeline-who { display: inline-flex; gap: 2px; margin-block: 12px 4px; padding: 2px; border-radius: 8px; background: var(--color-kumo-recessed); }
.emvb-timeline-who-option { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--text-color-kumo-default); font: inherit; font-size: 13px; cursor: pointer; }
.emvb-timeline-who-option:hover { background: var(--color-kumo-tint); }
.emvb-timeline-who-option:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: 1px; }
.emvb-timeline-who-option[aria-pressed="true"] { background: var(--color-kumo-base); box-shadow: var(--shadow-sm); outline: 1px solid var(--color-kumo-line); font-weight: 500; }
.emvb-timeline-count { min-width: 18px; padding: 0 5px; border-radius: 999px; background: var(--color-kumo-tint); color: var(--text-color-kumo-subtle); font-size: 11px; line-height: 16px; text-align: center; font-variant-numeric: tabular-nums; }
.emvb-timeline-frames { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.emvb-timeline-frames figure { margin: 0; }
.emvb-timeline-frames figcaption { font-size: 12px; color: var(--text-color-kumo-subtle); margin-bottom: 4px; }
.emvb-timeline-frame { width: 100%; height: 260px; border: 1px solid var(--color-kumo-line); border-radius: 6px; background: var(--color-kumo-base); }
.emvb-timeline-changes { margin: 8px 0; padding: 0; list-style: none; font-size: 13px; display: grid; gap: 4px; }
.emvb-timeline-changes > li { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
.emvb-timeline-kind { font-weight: 600; }
.emvb-timeline-changes > li[data-kind="added"] .emvb-timeline-kind { color: var(--text-color-kumo-success); }
.emvb-timeline-changes > li[data-kind="removed"] .emvb-timeline-kind { color: var(--text-color-kumo-danger); }
.emvb-timeline-changes > li[data-kind="changed"] .emvb-timeline-kind { color: var(--text-color-kumo-warning); }
.emvb-tokens-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: end; }
.emvb-tokens-grid > label, .emvb-tokens-field { display: grid; gap: 4px; min-width: 0; }
.emvb-tokens-fluid { display: flex !important; align-items: center; gap: 4px; font-size: 12px; }
/* UX-057: Ratio and the small-screen size take the full row, so "Major third" and the label
   "On small screens (px)" no longer truncate or wrap at the drawer's width. */
.emvb-tokens-grid > [data-emvb-tokens-row="full"] { grid-column: 1 / -1; }
.emvb-tokens-preview { margin: 8px 0; padding: 0; list-style: none; display: grid; grid-template-columns: max-content minmax(0, 1fr) auto; gap: 4px 8px; font-size: 12px; }
.emvb-tokens-preview > li { display: grid; grid-column: 1 / -1; grid-template-columns: subgrid; align-items: center; min-height: 24px; }
.emvb-tokens-preview > li > span:nth-child(2) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.emvb-tokens-sample { display: inline-block; height: 1em; line-height: 1; }
.emvb-tokens-preview .emvb-tokens-sample:empty { height: 8px; border-radius: 2px; background: var(--color-kumo-brand); }
.emvb-tokens-preview code { font-size: 11px; color: var(--text-color-kumo-subtle); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px; }
.emvb-a11y-score { height: 28px; padding: 0 8px; border: 1px solid var(--color-kumo-line); border-radius: 999px; background: transparent; color: var(--text-color-kumo-default); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
.emvb-a11y-score[data-band="good"] b, .emvb-a11y [data-band="good"] { color: var(--text-color-kumo-success); }
.emvb-a11y-score[data-band="fair"] b, .emvb-a11y [data-band="fair"] { color: var(--text-color-kumo-warning); }
.emvb-a11y-score[data-band="poor"] b, .emvb-a11y [data-band="poor"] { color: var(--text-color-kumo-danger); }
.emvb-a11y-score:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: 1px; }
.emvb-a11y-issues { margin: 12px 0; padding: 0; list-style: none; display: grid; gap: 8px; max-height: 50vh; overflow-y: auto; }
.emvb-a11y-issues > li { display: flex; gap: 8px; align-items: flex-start; justify-content: space-between; font-size: 13px; padding-left: 8px; border-left: 3px solid var(--color-kumo-warning); }
.emvb-a11y-issues > li[data-severity="error"] { border-left-color: var(--color-kumo-danger); }
.emvb-a11y-severity { flex: none; margin-top: 2px; color: var(--text-color-kumo-warning); }
.emvb-a11y-issues > li[data-severity="error"] .emvb-a11y-severity { color: var(--text-color-kumo-danger); }
.emvb-a11y-what { flex: 1 1 auto; min-width: 0; }
.emvb-a11y-actions { display: flex; gap: 8px; justify-content: flex-end; }
.emvb-sources { margin: 4px 0 8px; font-size: 12px; }
.emvb-sources > summary { cursor: pointer; display: flex; justify-content: space-between; gap: 8px; font-weight: 600; }
.emvb-sources-count { font-weight: 400; color: var(--text-color-kumo-subtle); display: inline-flex; align-items: center; gap: 8px; }
.emvb-sources > summary { list-style: none; align-items: center; border-radius: 4px; }
/* UX-066: the label stays on one line; a long count moves under it, right-aligned. */
.emvb-sources > summary { flex-wrap: wrap; row-gap: 2px; }
.emvb-sources-label { white-space: nowrap; }
.emvb-sources-count { margin-left: auto; white-space: nowrap; }
.emvb-sources > summary::-webkit-details-marker { display: none; }
.emvb-sources > summary:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: 2px; }
.emvb-sources-caret { color: var(--text-color-kumo-default); }
.emvb-sources[open] .emvb-sources-caret { transform: rotate(90deg); }
.emvb-sources ul { margin: 6px 0 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.emvb-sources li { display: grid; grid-template-columns: 1fr auto; gap: 0 8px; padding-left: 6px; border-left: 2px solid var(--color-kumo-line); }
.emvb-sources li[data-kind="class"] { border-left-color: var(--color-kumo-info); }
.emvb-sources li[data-kind="default"] { border-left-color: var(--color-kumo-success); }
.emvb-sources li[data-kind="local"] { border-left-color: var(--color-kumo-brand); }
.emvb-sources-value { font-family: ui-monospace, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px; }
.emvb-sources-from, .emvb-sources-over { grid-column: 1 / -1; color: var(--text-color-kumo-subtle); }
.emvb-sources-over { text-decoration: line-through; text-decoration-color: color-mix(in srgb, currentColor 40%, transparent); }
.emvb-recipe-list { display: grid; gap: 6px; }
.emvb-recipe-tile { display: grid; gap: 2px; text-align: start; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--color-kumo-line); background: var(--color-kumo-base, transparent); cursor: pointer; font: inherit; color: inherit; }
.emvb-recipe-tile:hover, .emvb-recipe-tile:focus-visible { border-color: var(--color-kumo-brand); }
.emvb-recipe-name { font-weight: 600; font-size: 13px; }
.emvb-recipe-desc { font-size: 12px; color: var(--text-color-kumo-subtle); }
.emvb-motion-effect { display: grid; grid-template-columns: 1fr 1fr auto; gap: 6px; align-items: end; }
.emvb-motion-name { grid-column: 1 / -1; font-size: 12px; font-weight: 600; }
/* UX-092: the fixed theme part type, its label and value on one line */
.emvb-part-type { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 0; }
.emvb-part-type-value { font-size: 13px; line-height: 20px; font-weight: 600; color: var(--text-color-kumo-default); }
`;
