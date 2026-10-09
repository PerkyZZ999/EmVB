/**
 * Editor styles for the W-307 feature batch (bindings, palette, meters, timeline…), kept apart
 * from the core chrome in editor-css.ts. Kumo variables only.
 */
export const FEATURE_CSS = `
.emvb-native-select, .emvb-native-input {
  height: var(--emvb-control, 28px);
  min-width: 0;
  padding: 0 8px;
  border: 1px solid var(--color-kumo-line);
  border-radius: 6px;
  background: var(--color-kumo-base);
  color: var(--text-color-kumo-default);
  font: inherit;
}
.emvb-native-select:focus-visible, .emvb-native-input:focus-visible {
  outline: 2px solid var(--color-kumo-brand);
  outline-offset: 1px;
}
.emvb-bind { display: grid; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-kumo-hairline); }
.emvb-bind-title { margin: 0; font-size: 12px; font-weight: 600; }
.emvb-bind-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 6px; align-items: center; }
.emvb-bind-row > .emvb-bind-label { grid-column: 1 / -1; font-size: 12px; color: var(--text-color-kumo-subtle); }
.emvb-bind-live { grid-column: 1 / -1; margin: 0; font-size: 12px; color: var(--text-color-kumo-default); overflow-wrap: anywhere; }
.emvb-bind-live > b { font-weight: 600; }
.emvb-js-badge { margin-left: auto; padding: 0 4px; border-radius: 4px; font-size: 10px; font-weight: 700; line-height: 16px; background: var(--color-kumo-warning-tint, #fef3c7); color: var(--text-color-kumo-default); }
.emvb-element-tile { position: relative; }
.emvb-element-tile > .emvb-js-badge { position: absolute; top: 4px; right: 4px; }
.emvb-perf-bars { display: grid; gap: 8px; margin: 12px 0; padding: 0; list-style: none; }
.emvb-perf-bars > li { display: grid; grid-template-columns: 90px 1fr auto; gap: 8px; align-items: center; font-size: 13px; }
.emvb-perf-bar { display: block; height: 8px; border-radius: 4px; background: var(--color-kumo-tint); overflow: hidden; }
.emvb-perf-bar > span { display: block; height: 100%; background: var(--color-kumo-brand); }
.emvb-perf-bars > li[data-over] .emvb-perf-bar > span { background: var(--color-kumo-danger, #dc2626); }
.emvb-perf-value { font-variant-numeric: tabular-nums; color: var(--text-color-kumo-subtle); }
.emvb-perf-warnings { margin: 8px 0; padding-left: 18px; font-size: 13px; }
.emvb-perf-heading { margin: 12px 0 4px; font-size: 13px; font-weight: 600; }
.emvb-perf-sections { margin: 0 0 8px; padding-left: 18px; font-size: 13px; }
.emvb-topbar-meter { font-variant-numeric: tabular-nums; font-size: 12px; }
.emvb-js-badge + .emvb-ab-badge { margin-left: 2px; }
.emvb-ab-badge { background: var(--color-kumo-info-tint, #dbeafe); }
.emvb-aud-checks { display: flex; flex-wrap: wrap; gap: 4px 10px; margin: 0; padding: 0; border: 0; font-size: 12px; }
.emvb-aud-checks > legend { width: 100%; padding: 0; margin-bottom: 2px; }
.emvb-palette { padding: 0; overflow: hidden; }
.emvb-palette-input { width: 100%; height: 44px; padding: 0 16px; border: 0; border-bottom: 1px solid var(--color-kumo-line); background: transparent; color: var(--text-color-kumo-default); font: inherit; font-size: 15px; outline: none; }
.emvb-palette-list { max-height: min(60vh, 420px); overflow-y: auto; margin: 0; padding: 4px; list-style: none; }
.emvb-palette-group { padding: 8px 10px 2px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--text-color-kumo-subtle); }
.emvb-palette-item { display: flex; justify-content: space-between; gap: 12px; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.emvb-palette-item[aria-selected="true"] { background: var(--color-kumo-tint); }
.emvb-palette-hint { color: var(--text-color-kumo-subtle); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 50%; }
.emvb-palette-empty { padding: 12px; color: var(--text-color-kumo-subtle); font-size: 13px; }
.emvb-palette-tips { margin: 0; padding: 6px 12px; border-top: 1px solid var(--color-kumo-line); font-size: 11px; color: var(--text-color-kumo-subtle); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.emvb-timeline-body { display: grid; grid-template-columns: 200px 1fr; gap: 16px; margin: 12px 0; min-height: 0; }
.emvb-timeline-list { margin: 0; padding: 0; list-style: none; max-height: 60vh; overflow-y: auto; }
.emvb-timeline-version { width: 100%; padding: 6px 8px; border: 0; border-radius: 6px; background: transparent; color: inherit; font: inherit; font-size: 12px; text-align: start; cursor: pointer; }
.emvb-timeline-version[aria-current="true"] { background: var(--color-kumo-tint); font-weight: 600; }
.emvb-timeline-frames { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.emvb-timeline-frames figure { margin: 0; }
.emvb-timeline-frames figcaption { font-size: 12px; color: var(--text-color-kumo-subtle); margin-bottom: 4px; }
.emvb-timeline-frame { width: 100%; height: 260px; border: 1px solid var(--color-kumo-line); border-radius: 6px; background: #fff; }
.emvb-timeline-changes { margin: 8px 0; padding: 0; list-style: none; font-size: 13px; display: grid; gap: 4px; }
.emvb-timeline-changes > li { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
.emvb-timeline-kind { font-weight: 600; }
.emvb-timeline-changes > li[data-kind="added"] .emvb-timeline-kind { color: #15803d; }
.emvb-timeline-changes > li[data-kind="removed"] .emvb-timeline-kind { color: #b91c1c; }
.emvb-timeline-changes > li[data-kind="changed"] .emvb-timeline-kind { color: #b45309; }
.emvb-tokens-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: end; }
.emvb-tokens-grid > label { display: grid; gap: 4px; min-width: 0; }
.emvb-tokens-fluid { display: flex !important; align-items: center; gap: 4px; font-size: 12px; }
.emvb-tokens-preview { margin: 8px 0; padding: 0; list-style: none; display: grid; gap: 4px; font-size: 12px; }
.emvb-tokens-preview > li { display: grid; grid-template-columns: 48px 1fr auto; gap: 8px; align-items: center; }
.emvb-tokens-sample { display: inline-block; height: 1em; line-height: 1; }
.emvb-tokens-preview .emvb-tokens-sample:empty { height: 8px; border-radius: 2px; background: var(--color-kumo-brand); }
.emvb-tokens-preview code { font-size: 11px; color: var(--text-color-kumo-subtle); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px; }
.emvb-a11y-score { height: 28px; padding: 0 8px; border: 1px solid var(--color-kumo-line); border-radius: 999px; background: transparent; color: var(--text-color-kumo-default); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
.emvb-a11y-score[data-band="good"] b, .emvb-a11y [data-band="good"] { color: #15803d; }
.emvb-a11y-score[data-band="fair"] b, .emvb-a11y [data-band="fair"] { color: #b45309; }
.emvb-a11y-score[data-band="poor"] b, .emvb-a11y [data-band="poor"] { color: #b91c1c; }
.emvb-a11y-score:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: 1px; }
.emvb-a11y-issues { margin: 12px 0; padding: 0; list-style: none; display: grid; gap: 8px; max-height: 50vh; overflow-y: auto; }
.emvb-a11y-issues > li { display: flex; gap: 8px; align-items: flex-start; justify-content: space-between; font-size: 13px; padding-left: 8px; border-left: 3px solid #d97706; }
.emvb-a11y-issues > li[data-severity="error"] { border-left-color: #dc2626; }
.emvb-a11y-actions { display: flex; gap: 8px; justify-content: flex-end; }
.emvb-sources { margin: 4px 0 8px; font-size: 12px; }
.emvb-sources > summary { cursor: pointer; display: flex; justify-content: space-between; gap: 8px; font-weight: 600; }
.emvb-sources-count { font-weight: 400; color: var(--text-color-kumo-subtle); }
.emvb-sources ul { margin: 6px 0 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.emvb-sources li { display: grid; grid-template-columns: 1fr auto; gap: 0 8px; padding-left: 6px; border-left: 2px solid var(--color-kumo-line); }
.emvb-sources li[data-kind="class"] { border-left-color: #7c3aed; }
.emvb-sources li[data-kind="default"] { border-left-color: #0d9488; }
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
`;
