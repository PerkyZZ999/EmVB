/**
 * The canvas follows the admin's own light or dark mode (extensionApi 1.5).
 *
 * A kit's dark rules answer to `data-emvb-theme` on the page root (see `scopeExtensionCss`), which a
 * public visitor's saved choice sets before the first paint. The canvas page is its own document, so
 * its root carries the same attribute, taken from the admin's mode (`data-mode` on the admin root),
 * and follows it when the admin switches. A kit's dark rules then show while editing, as they do for
 * a visitor who picked dark.
 */
export type CanvasTheme = "light" | "dark";

/** The admin's current mode. Anything but an explicit `dark` is light. */
export function adminTheme(root: HTMLElement = document.documentElement): CanvasTheme {
  return root.dataset["mode"] === "dark" ? "dark" : "light";
}

/** Put `theme` on the canvas root as the theme attribute a public page would carry. */
export function applyCanvasTheme(canvasDoc: Document, theme: CanvasTheme): void {
  const root = canvasDoc.documentElement;
  root.setAttribute("data-emvb-theme", theme);
  // The browser's own page colours (scrollbars, form controls) follow too.
  root.style.colorScheme = theme;
}

/**
 * Keep the canvas root on the admin's mode: now, and on every later switch. Returns the function
 * that stops watching.
 */
export function followAdminTheme(
  canvasDoc: Document,
  adminRoot: HTMLElement = document.documentElement,
): () => void {
  applyCanvasTheme(canvasDoc, adminTheme(adminRoot));
  const view = adminRoot.ownerDocument.defaultView;
  if (!view || typeof view.MutationObserver !== "function") return () => {};
  const observer = new view.MutationObserver(() => {
    applyCanvasTheme(canvasDoc, adminTheme(adminRoot));
  });
  observer.observe(adminRoot, { attributes: true, attributeFilter: ["data-mode"] });
  return () => observer.disconnect();
}
