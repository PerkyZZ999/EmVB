import type {
  ConditionsDoc,
  FloatSettings,
  Layout,
  ThemePartType,
  TriggersDoc,
} from "../core/index.ts";
import { PAGES_COLLECTION } from "../constants.ts";
import { listAllItems, requestJson, type Fetcher } from "./api.ts";
import { titleOf, type ContentItem } from "./content-item.ts";
import { entryStatus } from "./entry-status.ts";

export { publishDesign, saveDesign } from "./design-api.ts";

const CONTENT = `/_emdash/api/content/${PAGES_COLLECTION}`;

export type PageSummary = {
  id: string;
  title: string;
  slug: string;
  status: string;
  updatedAt: string;
};

export async function listPages(fetcher: Fetcher): Promise<PageSummary[]> {
  const items = await listAllItems<ContentItem>(fetcher, CONTENT);
  return items.map((item) => ({
    id: item.id,
    title: titleOf(item, "Untitled page"),
    slug: item.slug ?? "",
    status: entryStatus(item),
    updatedAt: item.updatedAt ?? "",
  }));
}

export async function createPage(
  fetcher: Fetcher,
  input: { title: string; slug: string; layout: Layout },
): Promise<string> {
  const body = await requestJson<{ item: ContentItem }>(fetcher, CONTENT, {
    method: "POST",
    body: { data: { title: input.title, layout: input.layout }, slug: input.slug },
  });
  return body.item.id;
}

export type PageDraft = {
  title: string;
  slug: string;
  canvasMode: string;
  seoTitle: string;
  seoDescription: string;
  /** W-284: absolute http(s) URL, or "" for none. Absent = leave the saved value alone. */
  seoCanonical?: string;
  /** W-284: ask search engines not to index the page. Absent = leave the saved value alone. */
  seoNoIndex?: boolean;
  /**
   * W-287: social (OG) image as EmDash reads it: an absolute URL or a site path (the media
   * library's `/_emdash/api/media/file/…`); "" for none. Absent = leave the saved value alone.
   */
  seoImage?: string;
  layout: Layout | null;
  /** Theme parts only (emvb_theme_parts). */
  partType?: ThemePartType;
  conditions?: ConditionsDoc;
  /** Popups only — open triggers + thin advanced rules. */
  triggers?: TriggersDoc;
  /** Floats only — edge and whether a close button is offered. */
  float?: FloatSettings;
};

/**
 * W-284: EmDash accepts only an absolute http(s) canonical URL (or null) and refuses the whole
 * save otherwise, so the panel flags anything else and the save leaves the stored one alone.
 */
export function canonicalProblem(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol === "https:" || url.protocol === "http:") return null;
  } catch {
    // fall through
  }
  return "Not saved: use a full address starting with https://";
}

function seoBody(draft: PageDraft) {
  const canonical = draft.seoCanonical;
  return {
    // W-663: a title or description of only spaces was saved as is, so search results and
    // link previews showed a blank title instead of falling back to the page's own.
    title: draft.seoTitle.trim() || null,
    description: draft.seoDescription.trim() || null,
    ...(canonical !== undefined && !canonicalProblem(canonical)
      ? { canonical: canonical.trim() || null }
      : {}),
    ...(draft.seoNoIndex !== undefined ? { noIndex: draft.seoNoIndex } : {}),
    ...(draft.seoImage !== undefined ? { image: draft.seoImage.trim() || null } : {}),
  };
}

/** Saves the draft with `_rev`, so a concurrent change fails with 409 instead of being overwritten. */
export async function savePage(
  fetcher: Fetcher,
  id: string,
  draft: PageDraft,
  rev: string | null,
): Promise<string> {
  const body = await requestJson<{ _rev: string }>(
    fetcher,
    `${CONTENT}/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: {
        data: {
          title: draft.title,
          // UX-094: a page with no layout yet leaves the field alone; the server refuses null.
          ...(draft.layout ? { layout: draft.layout } : {}),
          canvas_mode: draft.canvasMode,
        },
        slug: draft.slug,
        seo: seoBody(draft),
        ...(rev ? { _rev: rev } : {}),
      },
    },
  );
  return body["_rev"];
}

/** Publishes entry `id` of the collection at `contentPath`, sending `rev` so a stale draft fails. */
export async function publishEntry(
  fetcher: Fetcher,
  contentPath: string,
  id: string,
  rev: string | null,
) {
  const body = await requestJson<{ _rev: string; item: { slug?: string | null } }>(
    fetcher,
    `${contentPath}/${encodeURIComponent(id)}/publish`,
    { method: "POST", body: rev ? { _rev: rev } : {} },
  );
  return { rev: body["_rev"], slug: body.item.slug ?? "" };
}

/**
 * Drops the saved draft of entry `id` so it is back to its published version (W-193). EmDash's
 * `discard-draft` checks `rev`, so a draft saved elsewhere meanwhile fails with 409.
 */
export async function discardDraft(
  fetcher: Fetcher,
  collection: string,
  id: string,
  rev: string | null,
): Promise<void> {
  await requestJson<unknown>(
    fetcher,
    `/_emdash/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/discard-draft`,
    { method: "POST", body: rev === null ? {} : { _rev: rev } },
  );
}

export const publishPage = (fetcher: Fetcher, id: string, rev: string | null) =>
  publishEntry(fetcher, CONTENT, id, rev);

export async function previewUrl(fetcher: Fetcher, id: string): Promise<string> {
  const body = await requestJson<{ url: string }>(
    fetcher,
    `${CONTENT}/${encodeURIComponent(id)}/preview-url`,
    { method: "POST", body: {} },
  );
  return body.url;
}
