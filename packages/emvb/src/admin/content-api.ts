import type { ConditionsDoc, DesignSystem, Layout } from "../core/index.ts";
import { PAGES_COLLECTION, PLUGIN_ID } from "../constants.ts";
import { requestJson, type Fetcher } from "./api.ts";

const CONTENT = `/_emdash/api/content/${PAGES_COLLECTION}`;

type RawItem = {
  id: string;
  slug?: string | null;
  status?: string;
  updatedAt?: string;
  data?: Record<string, unknown>;
  seo?: { title?: string | null; description?: string | null } | null;
};

export type PageSummary = {
  id: string;
  title: string;
  slug: string;
  status: string;
  updatedAt: string;
};

const titleOf = (item: RawItem) =>
  typeof item.data?.["title"] === "string" && item.data["title"]
    ? item.data["title"]
    : "Untitled page";

export async function listPages(fetcher: Fetcher): Promise<PageSummary[]> {
  const body = await requestJson<{ items?: RawItem[] }>(
    fetcher,
    `${CONTENT}?limit=50&orderBy=updatedAt&order=desc`,
  );
  return (body?.items ?? []).map((item) => ({
    id: item.id,
    title: titleOf(item),
    slug: item.slug ?? "",
    status: item.status ?? "draft",
    updatedAt: item.updatedAt ?? "",
  }));
}

export async function createPage(
  fetcher: Fetcher,
  input: { title: string; slug: string; layout: Layout },
): Promise<string> {
  const body = await requestJson<{ item: RawItem }>(fetcher, CONTENT, {
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
  layout: Layout | null;
  /** Theme parts only (emvb_theme_parts). */
  partType?: "header" | "footer";
  conditions?: ConditionsDoc;
};

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
        data: { title: draft.title, layout: draft.layout, canvas_mode: draft.canvasMode },
        slug: draft.slug,
        seo: { title: draft.seoTitle || null, description: draft.seoDescription || null },
        ...(rev ? { _rev: rev } : {}),
      },
    },
  );
  return body["_rev"];
}

export async function publishPage(fetcher: Fetcher, id: string, rev: string | null) {
  const body = await requestJson<{ _rev: string; item: RawItem }>(
    fetcher,
    `${CONTENT}/${encodeURIComponent(id)}/publish`,
    { method: "POST", body: rev ? { _rev: rev } : {} },
  );
  return { rev: body["_rev"], slug: body.item.slug ?? "" };
}

export async function previewUrl(fetcher: Fetcher, id: string): Promise<string> {
  const body = await requestJson<{ url: string }>(
    fetcher,
    `${CONTENT}/${encodeURIComponent(id)}/preview-url`,
    { method: "POST", body: {} },
  );
  return body.url;
}

export async function saveDesign(
  fetcher: Fetcher,
  design: DesignSystem,
  revision: string | null,
): Promise<string> {
  const body = await requestJson<{ revision: string }>(
    fetcher,
    `/_emdash/api/plugins/${PLUGIN_ID}/design/save`,
    { method: "POST", body: { design, revision } },
  );
  return body.revision;
}
