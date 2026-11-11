import {
  collectSectionPartIds,
  portableTextToLayout,
  validateLayout,
  type Layout,
} from "../../core/index.ts";
import { layoutToPortableText, type PortableTextBlock } from "../../core/portable-text-export.ts";
import { THEME_PARTS_COLLECTION } from "../../constants.ts";
import { listAllItems, requestJson, type Fetcher } from "../api.ts";
import type { ContentItem } from "../content-item.ts";
import { readCollection } from "../setup/run.ts";

const SLUG = /^[a-z][a-z0-9_-]{0,63}$/;

/** The host entry the field sits on, from the admin URL `/content/<collection>/<id>`. */
export function hostEntryFromLocation(
  pathname: string,
): { collection: string; id: string } | undefined {
  const match = /\/content\/([^/?#]+)\/([^/?#]+)/.exec(pathname);
  if (!match) return undefined;
  const collection = decodeURIComponent(match[1] ?? "");
  const id = decodeURIComponent(match[2] ?? "");
  if (!SLUG.test(collection) || id === "new") return undefined;
  return { collection, id };
}

export type ConvertResult =
  | { ok: true; layout: Layout; converted: number; skipped: number; field: string }
  | { ok: false; message: string };

/**
 * W-912: reads the entry's saved rich-text body (the first Portable Text field, `content` first)
 * and builds a starter layout from it, headed by the entry's title. Read-only: the body is never written.
 */
export async function convertEntryBody(
  fetcher: Fetcher,
  entry: { collection: string; id: string },
): Promise<ConvertResult> {
  const schema = await readCollection(fetcher, entry.collection);
  const rich = (schema?.fields ?? []).filter((f) => f.type === "portableText");
  const field = rich.find((f) => f.slug === "content") ?? rich[0];
  if (!field) return { ok: false, message: "This collection has no rich-text field to convert." };
  const data = await requestJson<{ item: { data?: Record<string, unknown> } }>(
    fetcher,
    `/_emdash/api/content/${encodeURIComponent(entry.collection)}/${encodeURIComponent(entry.id)}`,
  );
  let body = data.item.data?.[field.slug];
  if (typeof body === "string") {
    try {
      body = JSON.parse(body) as unknown;
    } catch {
      body = null;
    }
  }
  if (!Array.isArray(body) || body.length === 0)
    return { ok: false, message: `The saved ${field.slug} field is empty.` };
  const title = data.item.data?.["title"];
  const result = portableTextToLayout(body, typeof title === "string" ? title : "");
  if (!result || result.converted === 0)
    return { ok: false, message: "Nothing in the saved body could be converted." };
  return { ok: true, ...result, field: field.slug };
}

export type RichTextPlan =
  | {
      ok: true;
      field: string;
      body: PortableTextBlock[];
      converted: number;
      skipped: Record<string, number>;
      /** The field already holds content that this replaces. */
      replaces: boolean;
    }
  | { ok: false; message: string };

/**
 * W-963: the reverse of Convert to EmVB, planned but not written: the layout as rich text for the
 * entry's first Portable Text field (`content` first), with synced sections resolved.
 */
export async function planRichText(
  fetcher: Fetcher,
  entry: { collection: string; id: string },
  layout: Layout,
): Promise<RichTextPlan> {
  const schema = await readCollection(fetcher, entry.collection);
  const rich = (schema?.fields ?? []).filter((f) => f.type === "portableText");
  const field = rich.find((f) => f.slug === "content") ?? rich[0];
  if (!field)
    return { ok: false, message: "This collection has no rich-text field to convert into." };
  const [data, parts] = await Promise.all([
    requestJson<{ item: { data?: Record<string, unknown> } }>(fetcher, entryPath(entry)),
    collectSectionPartIds(layout).length > 0
      ? listAllItems<ContentItem>(fetcher, `/_emdash/api/content/${THEME_PARTS_COLLECTION}`)
      : Promise.resolve([]),
  ]);
  const sectionTemplates: Record<string, Layout> = {};
  for (const part of parts) {
    if (part.status !== "published" || part.data?.["part_type"] !== "section") continue;
    const checked = validateLayout(part.data["layout"]);
    if (checked.ok) sectionTemplates[part.id] = checked.layout;
  }
  const result = layoutToPortableText(layout, { sectionTemplates });
  if (result.body.length === 0)
    return { ok: false, message: "This layout has no words or images to convert." };
  const current = data.item.data?.[field.slug];
  const replaces =
    (Array.isArray(current) && current.length > 0) ||
    (typeof current === "string" && current.trim() !== "" && current.trim() !== "[]");
  return { ok: true, field: field.slug, ...result, replaces };
}

/** Writes a planned body into the entry's rich-text field. Nothing else on the entry changes. */
export async function writeRichText(
  fetcher: Fetcher,
  entry: { collection: string; id: string },
  plan: Extract<RichTextPlan, { ok: true }>,
): Promise<void> {
  await requestJson(fetcher, entryPath(entry), {
    method: "PUT",
    body: { data: { [plan.field]: plan.body } },
  });
}

const entryPath = (entry: { collection: string; id: string }) =>
  `/_emdash/api/content/${encodeURIComponent(entry.collection)}/${encodeURIComponent(entry.id)}`;
