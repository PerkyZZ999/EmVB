/**
 * Editor chrome styles (DESIGN.md). The admin's Tailwind build is precompiled, so EmVB ships its
 * own rules, scoped to the editor root and built only from Kumo variables. Panels keep their
 * 1 px borders inside their width, so the canvas gets exactly the space between them (D-025).
 */
export const EDITOR_CSS = `
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
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  min-width: 0;
  background: var(--color-kumo-base);
  border-bottom: 1px solid var(--color-kumo-hairline);
}
.emvb-topbar-title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.emvb-topbar-spacer { flex: 1; }
.emvb-status { display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 8px; border-radius: 9999px; font-size: 12px; line-height: 16px; background: var(--color-kumo-base); box-shadow: inset 0 0 0 1px var(--color-kumo-hairline); white-space: nowrap; }
.emvb-status-dot { width: 8px; height: 8px; border-radius: 9999px; background: var(--text-color-kumo-subtle); }
.emvb-status[data-status="published"] .emvb-status-dot { background: var(--color-kumo-success); }
.emvb-frame { display: grid; grid-template-columns: 280px minmax(0, 1fr) 320px; min-height: 0; }
.emvb-panel { min-height: 0; overflow: auto; padding: 12px; background: var(--color-kumo-base); }
.emvb-panel-left { border-right: 1px solid var(--color-kumo-hairline); }
.emvb-panel-right { border-left: 1px solid var(--color-kumo-hairline); }
.emvb-panel-title { margin: 0; font-size: 16px; line-height: 20px; font-weight: 600; }
.emvb-canvas { min-width: 0; min-height: 0; background: var(--color-kumo-canvas); }
.emvb-canvas iframe { display: block; width: 100%; height: 100%; border: 0; background: #fff; }
.emvb-state { display: flex; align-items: center; justify-content: center; min-height: 0; padding: 24px; background: var(--color-kumo-elevated); }
.emvb-small-screen { grid-row: 1 / -1; }
.emvb-shortcuts { width: 100%; border-collapse: collapse; font-size: 13px; }
.emvb-shortcuts td { padding: 6px 0; border-bottom: 1px solid var(--color-kumo-hairline); }
.emvb-shortcuts td:last-child { text-align: right; font-family: var(--font-mono); color: var(--text-color-kumo-subtle); }
`;
