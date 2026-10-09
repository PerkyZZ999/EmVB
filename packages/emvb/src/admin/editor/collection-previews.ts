import * as React from "react";
import {
  collectCollectionLoops,
  type CollectionLoop,
  type Layout,
  type ThemePostFields,
} from "../../core/index.ts";
import { requestJson, type Fetcher } from "../api.ts";

type ContentItem = { id: string; slug?: string | null; data?: Record<string, unknown> };

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** A content API item as Loop fields; the host's mapping covers images and plain fields. */
function previewPost(item: ContentItem, collection: string): ThemePostFields {
  const data = item.data ?? {};
  const slug = item.slug || text(data["slug"]);
  const image = data["featured_image"] ?? data["image"];
  const src =
    typeof image === "string"
      ? image
      : image && typeof image === "object" && "src" in image
        ? text((image as { src?: unknown }).src)
        : "";
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(data).slice(0, 100)) {
    if (typeof value === "string" && value.length <= 2000) fields[key] = value;
  }
  return {
    id: item.id,
    slug: slug || item.id,
    title: text(data["title"]) || text(data["name"]),
    excerpt: text(data["excerpt"]),
    content: "",
    permalink: `/${collection}/${slug || item.id}`,
    ...(src ? { featuredImageUrl: src, featuredImageAlt: text(data["title"]) } : {}),
    fields,
  };
}

const ORDER: Record<string, string> = {
  newest: "orderBy=createdAt&order=desc",
  oldest: "orderBy=createdAt&order=asc",
  title: "orderBy=title&order=asc",
};

/**
 * Real entries for collection Loops on the canvas (W-308), read through the content API. A
 * collection the role can't read, or that doesn't exist, keeps the sample entries.
 */
export function useCollectionPreviews(
  layout: Layout | null,
  fetcher: Fetcher,
): Record<string, ThemePostFields[]> {
  const loops = layout ? collectCollectionLoops(layout) : [];
  const key = loops.length > 0 ? JSON.stringify(loops) : "";
  const [entries, setEntries] = React.useState<Record<string, ThemePostFields[]>>({});
  React.useEffect(() => {
    if (!key) {
      setEntries({});
      return;
    }
    let cancelled = false;
    const wanted = JSON.parse(key) as CollectionLoop[];
    void Promise.all(
      wanted.map(async (loop) => {
        try {
          const body = await requestJson<{
            items?: { id: string; slug?: string | null; data?: Record<string, unknown> }[];
          }>(
            fetcher,
            `/_emdash/api/content/${loop.collection}?limit=${loop.limit}&${ORDER[loop.order] ?? ORDER["newest"]}`,
          );
          const items = (body?.items ?? []).map((item) => previewPost(item, loop.collection));
          return [loop.nodeId, items] as const;
        } catch {
          return undefined;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      const next: Record<string, ThemePostFields[]> = {};
      for (const result of results) if (result) next[result[0]] = result[1];
      setEntries(next);
    });
    return () => {
      cancelled = true;
    };
  }, [key, fetcher]);
  return entries;
}
