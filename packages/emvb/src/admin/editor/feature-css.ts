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
`;
