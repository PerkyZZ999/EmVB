/**
 * Scrolls the canvas to an element after it was inserted, so the new section or block is visible
 * instead of landing below the fold with nothing to show it arrived. Runs after the canvas has
 * re-rendered, and does nothing if the element is not on the page.
 */
export function revealInCanvas(id: string): void {
  // ponytail: one frame lets the canvas (a portal into the iframe) render the new node first.
  requestAnimationFrame(() => {
    const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Page canvas"]');
    const doc = frame?.contentDocument;
    const target = doc?.querySelector(`[data-emvb-id="${CSS.escape(id)}"]`);
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}
