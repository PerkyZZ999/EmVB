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
`;
