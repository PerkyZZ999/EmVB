import { validateLayout, type Layout } from "../core/index.ts";
import { layoutToPortableText } from "../core/portable-text-export.ts";
import { THEME_PARTS_COLLECTION } from "../constants.ts";
import { ApiError, listAllItems, requestJson, type Fetcher } from "./api.ts";
import type { ContentItem } from "./content-item.ts";
import { loadExportData } from "./export-api.ts";
import { readCollection } from "./setup/run.ts";

export type RichTextTarget = {
  slug: string;
  label: string;
  /** The Portable Text field the words go into (`content` first). */
  field: string;
  /** The collection has a `title` field for the page title. */
  hasTitle: boolean;
};

/** Visible collections with a rich-text field: where EmVB pages can be copied as rich text. */
export async function richTextTargets(fetcher: Fetcher): Promise<RichTextTarget[]> {
  const list = await requestJson<{ items: { slug: string; label?: string; hidden?: boolean }[] }>(
    fetcher,
    "/_emdash/api/schema/collections",
  );
  const rows = await Promise.all(
    list.items
      .filter((c) => !c.hidden)
      .map(async (c) => {
        const fields = (await readCollection(fetcher, c.slug))?.fields ?? [];
        const rich = fields.filter((f) => f.type === "portableText");
        const field = rich.find((f) => f.slug === "content") ?? rich[0];
        if (!field) return null;
        const target: RichTextTarget = {
          slug: c.slug,
          label: c.label?.trim() || c.slug,
          field: field.slug,
          hasTitle: fields.some((f) => f.slug === "title"),
        };
        return target;
      }),
  );
  return rows.filter((row): row is RichTextTarget => row !== null);
}

export type CopyResult = {
  created: { title: string; id: string }[];
  failed: { title: string; message: string }[];
  /** Elements left out across all pages, by type. */
  skipped: Record<string, number>;
};

/**
 * W-963: published EmVB pages (all or one) become draft entries in another collection, their
 * words, headings, lists, links and images as rich text. EmVB pages are only read; nothing is
 * published. A page whose entry can't be created (a slug in use) is reported and the rest go on.
 */
export async function copyPagesAsRichText(
  fetcher: Fetcher,
  target: RichTextTarget,
  onlyPageId?: string,
): Promise<CopyResult> {
  const [{ pages }, partItems] = await Promise.all([
    loadExportData(fetcher, onlyPageId),
    listAllItems<ContentItem>(fetcher, `/_emdash/api/content/${THEME_PARTS_COLLECTION}`),
  ]);
  const sectionTemplates: Record<string, Layout> = {};
  for (const part of partItems) {
    if (part.status !== "published" || part.data?.["part_type"] !== "section") continue;
    const checked = validateLayout(part.data["layout"]);
    if (checked.ok) sectionTemplates[part.id] = checked.layout;
  }
  const result: CopyResult = { created: [], failed: [], skipped: {} };
  for (const page of pages) {
    let raw = page.layout;
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw) as unknown;
      } catch {
        raw = null;
      }
    }
    const checked = validateLayout(raw);
    if (!checked.ok) {
      result.failed.push({ title: page.title, message: "its layout couldn't be read" });
      continue;
    }
    const converted = layoutToPortableText(checked.layout, { sectionTemplates });
    for (const [type, n] of Object.entries(converted.skipped))
      result.skipped[type] = (result.skipped[type] ?? 0) + n;
    try {
      // oxlint-disable-next-line no-await-in-loop -- one entry at a time; failures are per page
      const body = await requestJson<{ item: { id: string } }>(
        fetcher,
        `/_emdash/api/content/${encodeURIComponent(target.slug)}`,
        {
          method: "POST",
          body: {
            data: {
              ...(target.hasTitle ? { title: page.title } : {}),
              [target.field]: converted.body,
            },
            ...(page.slug ? { slug: page.slug } : {}),
          },
        },
      );
      result.created.push({ title: page.title, id: body.item.id });
    } catch (error) {
      result.failed.push({
        title: page.title,
        message:
          error instanceof ApiError && error.status === 409
            ? "its address is already used there"
            : error instanceof Error
              ? error.message
              : String(error),
      });
    }
  }
  return result;
}
