import { isRecord } from "./record.ts";

/** Props whose strings are words a visitor reads (W-978), not ids, URLs or settings. */
const WORD_KEYS: ReadonlySet<string> = new Set([
  "text",
  "label",
  "summary",
  "alt",
  "caption",
  "placeholder",
  "title",
  "description",
  "items",
  "quote",
  "author",
  "role",
  "prefix",
  "suffix",
]);

/** At most this many characters per layout, so a huge page can't slow the list down. */
const MAX_SEARCH_TEXT = 20_000;

/**
 * W-978: the words of a stored layout (headings, text, buttons, list items, labels, alt text),
 * for searching lists by content. Reads raw JSON (or a JSON string), so an unreadable layout
 * gives "" rather than an error. Synced sections are read where they live, not here.
 */
export function layoutSearchText(layout: unknown): string {
  let value = layout;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return "";
    }
  }
  if (!isRecord(value)) return "";
  const out: string[] = [];
  let length = 0;
  const push = (text: string) => {
    if (length >= MAX_SEARCH_TEXT) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    out.push(trimmed);
    length += trimmed.length + 1;
  };
  const stack: unknown[] = [value["root"]];
  while (stack.length > 0) {
    if (length >= MAX_SEARCH_TEXT) break;
    const node = stack.pop();
    if (!isRecord(node)) continue;
    const props = node["props"];
    if (isRecord(props)) {
      for (const [key, prop] of Object.entries(props)) {
        if (!WORD_KEYS.has(key)) continue;
        if (typeof prop === "string") push(prop);
        else if (Array.isArray(prop))
          for (const item of prop) {
            if (typeof item === "string") push(item);
            else if (isRecord(item) && typeof item["label"] === "string") push(item["label"]);
          }
      }
    }
    const children = node["children"];
    if (Array.isArray(children))
      for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
  }
  return out.join(" ").slice(0, MAX_SEARCH_TEXT);
}
