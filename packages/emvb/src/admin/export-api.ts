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

/** Only what visitors see: published entries (a saved draft on top stays out). */
const isLive = (item: ContentItem) => item.status === "published";

/** Published pages (or one), published theme parts and the published Site styles. */
export async function loadExportData(fetcher: Fetcher, onlyPageId?: string) {
  const [pageItems, partItems, design] = await Promise.all([
    listAllItems<ContentItem>(fetcher, `/_emdash/api/content/${PAGES_COLLECTION}`),
    listAllItems<ContentItem>(fetcher, `/_emdash/api/content/${THEME_PARTS_COLLECTION}`),
    loadDesign(fetcher),
  ]);
  const pages: ExportPageInput[] = pageItems
    .filter((item) => isLive(item) && (!onlyPageId || item.id === onlyPageId))
    .map((item) => {
      const page: ExportPageInput = {
        id: item.id,
        title: titleOf(item, "Untitled page"),
        slug: item.slug ?? "",
        layout: item.data?.["layout"],
      };
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
    copyMedia: boolean;
    origin: string;
    get?: (url: string) => Promise<Response>;
    date?: string;
  },
): Promise<ExportResult> {
  const data = await loadExportData(fetcher, options.onlyPageId);
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
