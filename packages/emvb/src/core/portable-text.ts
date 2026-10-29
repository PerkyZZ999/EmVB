import { MAX_NODES, MAX_TEXT_LENGTH } from "./limits.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout, type LayoutNode } from "./schema/layout.ts";
import { sanitizeUrl } from "./sanitize/url.ts";
import { newNodeId } from "./tree-ops.ts";
import { validateLayout } from "./validate.ts";

const IMAGE_SCHEMES: ReadonlySet<string> = new Set(["https:", "http:"]);
const LIST_ITEMS_MAX = 200;
const MEDIA_ID = /^[A-Za-z0-9_-]{1,128}$/;

type Record_ = Record<string, unknown>;
const isRecord = (value: unknown): value is Record_ =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A block's plain text: its spans' text joined. Marks and links are dropped (starter layout). */
function blockText(block: Record_): string {
  const children = Array.isArray(block["children"]) ? block["children"] : [];
  let text = "";
  for (const child of children) {
    if (isRecord(child) && typeof child["text"] === "string") text += child["text"];
  }
  return text.trim().slice(0, MAX_TEXT_LENGTH);
}

function imageNode(block: Record_, id: string): LayoutNode | null {
  const asset = isRecord(block["asset"]) ? block["asset"] : {};
  const raw = typeof asset["url"] === "string" ? asset["url"] : block["url"];
  const src = typeof raw === "string" ? sanitizeUrl(raw, IMAGE_SCHEMES) : undefined;
  if (!src) return null;
  const alt = typeof block["alt"] === "string" ? block["alt"].trim().slice(0, 500) : "";
  const ref = asset["_ref"] ?? asset["id"];
  const props: Record_ = { src, alt, ...(alt ? {} : { decorative: true }) };
  if (typeof ref === "string" && MEDIA_ID.test(ref)) props["mediaId"] = ref;
  for (const key of ["width", "height"] as const) {
    const value = block[key];
    if (typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 10000)
      props[key] = value;
  }
  return { id, type: "image", props } as LayoutNode;
}

/**
 * W-912: a starter EmVB layout from an entry's Portable Text body. Headings, paragraphs, quotes,
 * bullet/numbered lists and images with a safe URL come across as plain elements; everything else
 * (custom blocks, marks, embeds) is left out and counted. The body is untrusted: only strings are
 * copied, URLs go through the shared URL check, and the result is validated like any saved layout.
 */
export function portableTextToLayout(
  body: unknown,
  title = "",
  random?: () => number,
): { layout: Layout; converted: number; skipped: number } | null {
  if (!Array.isArray(body)) return null;
  const used = new Set<string>();
  const id = () => {
    let next = newNodeId(random);
    while (used.has(next)) next = newNodeId(random);
    used.add(next);
    return next;
  };
  const children: LayoutNode[] = [];
  let skipped = 0;
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (list && list.items.length > 0)
      children.push({ id: id(), type: "list", props: { ...list } } as LayoutNode);
    list = null;
  };
  const heading = title.trim().slice(0, MAX_TEXT_LENGTH);
  if (heading) children.push({ id: id(), type: "heading", props: { text: heading, level: 1 } });
  for (const block of body) {
    if (children.length >= MAX_NODES - 2) {
      skipped++;
      continue;
    }
    if (!isRecord(block)) {
      skipped++;
      continue;
    }
    if (block["_type"] === "image") {
      flush();
      const node = imageNode(block, id());
      if (node) children.push(node);
      else skipped++;
      continue;
    }
    if (block["_type"] !== "block") {
      flush();
      skipped++;
      continue;
    }
    const text = blockText(block);
    const listItem = block["listItem"];
    if (listItem === "bullet" || listItem === "number") {
      const ordered = listItem === "number";
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      if (text && list.items.length < LIST_ITEMS_MAX) list.items.push(text);
      else if (text) skipped++;
      continue;
    }
    flush();
    if (!text) continue;
    const style = typeof block["style"] === "string" ? block["style"] : "normal";
    const level = /^h([1-6])$/.exec(style);
    children.push(
      level
        ? { id: id(), type: "heading", props: { text, level: Number(level[1]) } }
        : { id: id(), type: "text", props: { text } },
    );
  }
  flush();
  const candidate = {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    root: {
      id: id(),
      type: "container",
      props: {},
      style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
      children,
    },
  };
  const checked = validateLayout(candidate);
  if (!checked.ok) return null;
  const converted = children.length - (heading ? 1 : 0);
  return { layout: checked.layout, converted, skipped };
}
