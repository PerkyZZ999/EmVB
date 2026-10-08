import { sanitizeHref, type LayoutNode } from "../../../../core/index.ts";

/**
 * W-273: a Button without a usable URL renders as a plain `<button>` that does nothing on the
 * live page. That's right when a popup's click trigger or a script targets it, usually by its
 * HTML id or a class, so only a button with neither gets the note.
 */
export function buttonUrlNote(node: LayoutNode): string | undefined {
  if (node.type !== "button") return undefined;
  const props = node.props as { href?: string };
  const href = props.href?.trim();
  if (href && sanitizeHref(href)) return undefined;
  if (node.htmlId || (node.classes?.length ?? 0) > 0) return undefined;
  return href
    ? "This URL isn't allowed, so the button does nothing on the live page. Use a full URL or a path such as /contact."
    : "No URL: this button does nothing on the live page. Add a URL, or give it an HTML id (Advanced) for a popup's click trigger.";
}
