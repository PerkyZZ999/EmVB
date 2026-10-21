/**
 * Print stylesheet (W-335). Chrome that only makes sense on screen is hidden.
 * Appended after scoped page CSS so the selectors stay global: a header, float or popup
 * is not inside the page's scope wrapper.
 * W-845 (D-054): every tab panel and accordion panel prints, not just the open one. The tab rule
 * matches the specificity of the screen rule that hides the other panels and comes later. A
 * closed <details> opens through ::details-content, so a browser without it prints the summary.
 */
export function printCss(): string {
  return (
    "@media print{" +
    ".emvb-theme-header,.emvb-theme-footer,.emvb-float,.emvb-popup{display:none!important}" +
    ".emvb-tabs:has(> .emvb-tab-input:nth-of-type(n):checked) > .emvb-tab-panels > .emvb-tab-panel:nth-of-type(n){display:block!important}" +
    ".emvb-accordion-item::details-content{content-visibility:visible;display:block}" +
    "}"
  );
}
