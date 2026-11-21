import * as React from "react";
import {
  collectCollectionLoops,
  entryImageValue,
  loopPermalink,
  mediaUrlOf,
  type CollectionLoop,
  type Layout,
  type ThemePostFields,
} from "../../core/index.ts";
import { requestJson, type Fetcher } from "../api.ts";

type ContentItem = { id: string; slug?: string | null; data?: Record<string, unknown> };

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** A content API item as Loop fields; the host's mapping covers images and plain fields. */
export function previewPost(item: ContentItem, loop: CollectionLoop): ThemePostFields {
  const data = item.data ?? {};
  const slug = item.slug || text(data["slug"]);
  // W-1090 (#32): as published pages read it: a picked upload has no `src`, only a storage key,
  // and unset falls back from featured_image to the entry's first image field.
  const image = entryImageValue(data, loop.imageField);
  const src = typeof image === "string" ? image : (mediaUrlOf(image) ?? "");
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(data).slice(0, 100)) {
    if (typeof value === "string" && value.length <= 2000) fields[key] = value;
  }
  return {
    id: item.id,
    slug: slug || item.id,
    title: text(data["title"]) || text(data["name"]),
    excerpt: text(data[loop.excerptField ?? "excerpt"]),
    content: "",
    permalink: loop.permalink
      ? loopPermalink(loop.permalink, { slug: slug || item.id, id: item.id })
      : `/${loop.collection}/${slug || item.id}`,
    ...(src ? { featuredImageUrl: src, featuredImageAlt: text(data["title"]) } : {}),
    fields,
  };
}

/**
 * W-330: the canvas applies a Loop's `field = value` filters to the entries it read. A field the
 * entries don't have (a taxonomy, say) can't be checked here, so it doesn't filter the preview;
 * the published page asks EmDash, which checks taxonomies too. A list or object field never
 * matches, as on the published page (W-505).
 */
export function matchesPreviewFilter(
  data: Record<string, unknown>,
  where: CollectionLoop["where"],
): boolean {
  if (!where) return true;
  return Object.entries(where).every(([field, wanted]) => {
    if (!(field in data)) return true;
    const value = data[field];
    // W-505: EmDash 1.2 filters a non-taxonomy field with SQL `column = value` (or IN), so a
    // list field (stored as JSON text) never matches there. String(["news"]) is "news", which
    // showed entries in the preview that the published Loop leaves out.
    if (Array.isArray(value) || (typeof value === "object" && value !== null)) return false;
    const values = Array.isArray(wanted) ? wanted : [wanted];
    return values.some((option) => String(value) === option);
  });
}

const ORDER: Record<string, string> = {
  newest: "orderBy=createdAt&order=desc",
  oldest: "orderBy=createdAt&order=asc",
  title: "orderBy=title&order=asc",
};

/**
 * W-667: the page plus the synced sections and Loop Item parts it shows, so a collection Loop
 * inside one of those gets real entries on the canvas like it does on the published page.
 */
export function withPartLayouts(layout: Layout | null, parts: readonly Layout[]): Layout | null {
  if (!layout || parts.length === 0) return layout;
  const children = [...layout.root.children, ...parts.flatMap((part) => part.root.children)];
  return { ...layout, root: { ...layout.root, children } };
}

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
          const items = (body?.items ?? [])
            .filter((item) => matchesPreviewFilter(item.data ?? {}, loop.where))
            .map((item) => previewPost(item, loop));
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
