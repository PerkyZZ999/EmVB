/**
 * The control's HTML id, from the element's own id (W-187). A field name is not unique on a page
 * (the same form twice, or a header and footer newsletter both asking for `email`) and can match a
 * host theme id, so a label's `for` would focus another form's input.
 */
export const controlId = (nodeId: string): string => `emvb-field-${nodeId}`;
