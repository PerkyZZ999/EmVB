import { portableTextToLayout, type Layout } from "../../core/index.ts";
import { requestJson, type Fetcher } from "../api.ts";
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
