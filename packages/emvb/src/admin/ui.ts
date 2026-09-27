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

export const UI_CSS = `
.emvb-btn.emvb-btn { height: 28px; border-radius: 6px; }
.emvb-icon-btn.emvb-icon-btn { width: 28px; height: 28px; border-radius: 6px; }
.emvb-field.emvb-field { height: 28px; border-radius: 6px; }
.emvb-mono { font-family: var(--font-mono); }
.emvb-helper { margin: 0; font-size: 12px; line-height: 16px; color: var(--text-color-kumo-subtle); }
.emvb-inline-error { display: flex; gap: 4px; align-items: flex-start; margin: 0; font-size: 12px; line-height: 16px; color: var(--text-color-kumo-danger); }
.emvb-status { display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 8px; border-radius: 9999px; font-size: 12px; line-height: 16px; background: color-mix(in oklab, var(--color-kumo-base) 96%, transparent); box-shadow: inset 0 0 0 1px var(--color-kumo-hairline); white-space: nowrap; }
.emvb-status-dot { width: 8px; height: 8px; border-radius: 9999px; background: var(--text-color-kumo-subtle); }
.emvb-status[data-status="published"] .emvb-status-dot { background: var(--color-kumo-success); }
@media (prefers-reduced-motion: reduce) {
  [data-emvb-editor] *, [data-emvb-page] * { transition: none !important; animation: none !important; }
}
@media (prefers-reduced-transparency: reduce) {
  .emvb-status { background: var(--color-kumo-base); }
}
`;
