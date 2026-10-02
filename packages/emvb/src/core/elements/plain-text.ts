import { MAX_TEXT_LENGTH } from "../limits.ts";
import type { LayoutNode } from "../schema/layout.ts";

/** Elements whose visible words are one `props.text` string (W-097). */
const PLAIN_TEXT = ["heading", "text", "label", "link", "button"] as const;

export function isPlainTextNode(node: LayoutNode): boolean {
  return (PLAIN_TEXT as readonly string[]).includes(node.type);
}

/** The stored string, or null when this element is not edited on the canvas. */
export function plainTextOf(node: LayoutNode): string | null {
  if (!isPlainTextNode(node)) return null;
  const text = "text" in node.props ? node.props.text : undefined;
  return typeof text === "string" ? text : null;
}

/** Paragraphs keep line breaks. Headings, labels, links and buttons stay one line. */
export function isMultilineText(node: LayoutNode): boolean {
  return node.type === "text";
}

/** The string a canvas edit may store. Over-long text is cut to the schema limit. */
export function commitPlainText(text: string, multiline: boolean): string {
  const flat = multiline ? text : text.replaceAll("\n", "");
  return flat.slice(0, MAX_TEXT_LENGTH);
}

export function withPlainText(node: LayoutNode, text: string): LayoutNode {
  if (!isPlainTextNode(node) || !("text" in node.props)) return node;
  return { ...node, props: { ...node.props, text } };
}
