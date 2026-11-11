import {
  buildSiteExport,
  withCopiedMedia,
  type ExportPageInput,
  type ExportPartInput,
  type SiteExport,
} from "../core/export/site.ts";
import { zipFiles } from "../core/export/zip.ts";
import { PAGES_COLLECTION, THEME_PARTS_COLLECTION } from "../constants.ts";
import { listAllItems, type Fetcher } from "./api.ts";
import { titleOf, type ContentItem } from "./content-item.ts";
import { loadDesign } from "./editor/useEditorData.ts";
import { loadHostCollections } from "./setup/host-collections.ts";
import { readCollection } from "./setup/run.ts";
import { readFieldLayout } from "./widgets/field-fetcher.ts";

/** Only what visitors see: published entries (a saved draft on top stays out). */
const isLive = (item: ContentItem) => item.status === "published";

/** A canvas field holding a layout with at least one element. */
const hasLayout = (value: unknown) => {
  const layout = readFieldLayout(value);
  return !!layout && (layout.root.children ?? []).length > 0;
};

/**
 * W-977: one of your collections whose entries carry an EmVB layout (an `emvb:canvas` field), and
 * where its entries are on the site.
 */
export type CanvasSource = {
  collection: string;
  label: string;
  field: string;
  urlPattern?: string | null;
};

/** Published entries of `source` with a layout, for picking one to export (W-977). */
export async function exportableEntries(
  fetcher: Fetcher,
  source: CanvasSource,
): Promise<{ id: string; title: string }[]> {
  const items = await listAllItems<ContentItem>(
    fetcher,
    `/_emdash/api/content/${source.collection}`,
  );
  return items
    .filter((item) => isLive(item) && hasLayout(item.data?.[source.field]))
    .map((item) => ({ id: item.id, title: titleOf(item, "Untitled entry") }))
    .toSorted((a, b) => a.title.localeCompare(b.title));
}

/** Collections with a canvas field, to export their entries like pages. */
export async function canvasSources(fetcher: Fetcher): Promise<CanvasSource[]> {
  const { rows } = await loadHostCollections(fetcher);
  const ready = rows.filter((row) => row.field === "ready" && row.fieldSlug);
  const states = await Promise.all(ready.map((row) => readCollection(fetcher, row.slug)));
  return ready.map((row, i) => ({
    collection: row.slug,
    label: row.label,
    field: row.fieldSlug as string,
    urlPattern: states[i]?.urlPattern ?? null,
  }));
}

/** An entry's public path from its collection's URL pattern (`/blog/{slug}`), or `/<slug>`. */
export function entryPath(pattern: string | null | undefined, slug: string): string {
  const path = (pattern || "/{slug}").replace("{slug}", encodeURIComponent(slug));
  return path.startsWith("/") ? path : `/${path}`;
}

/** Published pages (or one), published theme parts and the published Site styles. */
export async function loadExportData(
  fetcher: Fetcher,
  onlyPageId?: string,
  /** W-977: export this collection's entries (their canvas layouts) instead of EmVB pages. */
  source?: CanvasSource,
) {
  const [pageItems, partItems, design] = await Promise.all([
    listAllItems<ContentItem>(
      fetcher,
      `/_emdash/api/content/${source ? source.collection : PAGES_COLLECTION}`,
    ),
    listAllItems<ContentItem>(fetcher, `/_emdash/api/content/${THEME_PARTS_COLLECTION}`),
    loadDesign(fetcher),
  ]);
  const pages: ExportPageInput[] = pageItems
    .filter((item) => isLive(item) && (!onlyPageId || item.id === onlyPageId))
    // An entry without a layout shows the site's own template, which an export can't hold.
    .filter((item) => !source || hasLayout(item.data?.[source.field]))
    .map((item) => {
      const slug = item.slug ?? "";
      const page: ExportPageInput = {
        id: item.id,
        title: titleOf(item, source ? "Untitled entry" : "Untitled page"),
        slug,
        layout: source ? readFieldLayout(item.data?.[source.field]) : item.data?.["layout"],
      };
      if (source) {
        page.collection = source.collection;
        page.path = entryPath(source.urlPattern, slug);
      }
      if (item.seo?.description) page.description = item.seo.description;
      return page;
    })
    .toSorted((a, b) => a.title.localeCompare(b.title));
  const parts: ExportPartInput[] = partItems.filter(isLive).map((item) => ({
    id: item.id,
    title: titleOf(item, ""),
    partType: item.data?.["part_type"],
    layout: item.data?.["layout"],
    conditions: item.data?.["conditions"],
    triggers: item.data?.["triggers"],
    float: item.data?.["float"],
    updatedAt: item.updatedAt ?? "",
  }));
  return { pages, parts, design: design.published ?? design.design };
}

/** Media this site serves itself (same origin), which the export can copy. */
export function copyableMedia(urls: readonly string[], origin: string): string[] {
  return urls.filter((url) => {
    try {
      return new URL(url, origin).origin === origin;
    } catch {
      return false;
    }
  });
}

/** Up to this many media files are copied, so an export can't fill the browser's memory. */
const MAX_COPIED_MEDIA = 500;
const MAX_COPIED_BYTES = 200 * 1024 * 1024;

/** Downloads media for the export; files that fail are left as links (and counted). */
async function fetchMedia(
  urls: readonly string[],
  origin: string,
  get: (url: string) => Promise<Response>,
): Promise<{ copies: Map<string, Uint8Array>; failed: number }> {
  const copies = new Map<string, Uint8Array>();
  let failed = 0;
  let total = 0;
  for (const url of urls.slice(0, MAX_COPIED_MEDIA)) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- one at a time keeps memory and load low
      const response = await get(new URL(url, origin).href);
      if (!response.ok) throw new Error(String(response.status));
      // oxlint-disable-next-line no-await-in-loop -- same
      const bytes = new Uint8Array(await response.arrayBuffer());
      total += bytes.length;
      if (total > MAX_COPIED_BYTES) {
        failed += 1;
        continue;
      }
      copies.set(url, bytes);
    } catch {
      failed += 1;
    }
  }
  failed += Math.max(0, urls.length - MAX_COPIED_MEDIA);
  return { copies, failed };
}

export type ExportResult = {
  zip: Uint8Array;
  site: SiteExport;
  copied: number;
  failed: number;
};

/** The whole export as a zip, built in the browser from published content. */
export async function exportSite(
  fetcher: Fetcher,
  options: {
    onlyPageId?: string;
    /** W-977: a collection with a canvas field instead of EmVB pages. */
    source?: CanvasSource;
    copyMedia: boolean;
    origin: string;
    get?: (url: string) => Promise<Response>;
    date?: string;
  },
): Promise<ExportResult> {
  const data = await loadExportData(fetcher, options.onlyPageId, options.source);
  let site = buildSiteExport({
    ...data,
    ...(options.date ? { date: options.date } : {}),
  });
  let copied = 0;
  let failed = 0;
  if (options.copyMedia) {
    const get = options.get ?? ((url: string) => fetch(url, { credentials: "same-origin" }));
    const result = await fetchMedia(
      copyableMedia(site.report.media, options.origin),
      options.origin,
      get,
    );
    site = withCopiedMedia(site, result.copies);
    copied = result.copies.size;
    failed = result.failed;
  }
  return { zip: zipFiles(site.files), site, copied, failed };
}
