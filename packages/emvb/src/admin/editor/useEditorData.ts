import * as React from "react";
import {
  emptyDesign,
  validateDesign,
  validateLayout,
  type DesignSystem,
  type Layout,
} from "../../core/index.ts";
import { PAGES_COLLECTION, PLUGIN_ID } from "../../constants.ts";
import { ApiError, requestJson, type Fetcher } from "../api.ts";

export type EditorEntry = {
  id: string;
  title: string;
  slug: string;
  canvasMode: string;
  seoTitle: string;
  seoDescription: string;
  status: string;
  rev: string | null;
  layout: Layout | null;
};

export type LoadedDesign = { design: DesignSystem; revision: string | null };

export type EditorData =
  | { state: "loading" }
  | { state: "ready"; entry: EditorEntry; design: LoadedDesign }
  | { state: "not-found" | "forbidden" }
  | { state: "error"; message: string };

const UNREADABLE = "This page's layout can't be read.";

type ContentResponse = {
  item?: {
    id?: string;
    slug?: string | null;
    status?: string;
    data?: Record<string, unknown>;
    seo?: { title?: string | null; description?: string | null } | null;
  };
  _rev?: string;
};

const text = (value: unknown) => (typeof value === "string" ? value : "");

export async function loadEntry(fetcher: Fetcher, id: string): Promise<EditorEntry> {
  const body = await requestJson<ContentResponse>(
    fetcher,
    `/_emdash/api/content/${PAGES_COLLECTION}/${encodeURIComponent(id)}`,
  );
  const data = body?.item?.data ?? {};
  return {
    id: body?.item?.id ?? id,
    title: text(data["title"]),
    slug: body?.item?.slug ?? "",
    canvasMode: text(data["canvas_mode"]) || "site-layout",
    seoTitle: text(body?.item?.seo?.title),
    seoDescription: text(body?.item?.seo?.description),
    status: body?.item?.status ?? "draft",
    rev: body?.["_rev"] ?? null,
    layout: readLayout(data["layout"]),
  };
}

function readLayout(raw: unknown): Layout | null {
  if (raw === null || raw === undefined || raw === "") return null;
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      throw new Error(UNREADABLE);
    }
  }
  const result = validateLayout(value);
  if (!result.ok) throw new Error(UNREADABLE);
  return result.layout;
}

async function loadDesign(fetcher: Fetcher): Promise<LoadedDesign> {
  const body = await requestJson<{ design?: unknown; revision?: string | null }>(
    fetcher,
    `/_emdash/api/plugins/${PLUGIN_ID}/design`,
  );
  const result = validateDesign(body?.design);
  return {
    design: result.ok ? result.design : emptyDesign(),
    revision: body?.revision ?? null,
  };
}

export function useEditorData(fetcher: Fetcher, entryId: string): EditorData {
  const [data, setData] = React.useState<EditorData>({ state: "loading" });
  React.useEffect(() => {
    let active = true;
    setData({ state: "loading" });
    Promise.all([loadEntry(fetcher, entryId), loadDesign(fetcher)]).then(
      ([entry, design]) => active && setData({ state: "ready", entry, design }),
      (error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 404) setData({ state: "not-found" });
        else if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          setData({ state: "forbidden" });
        } else {
          setData({
            state: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [fetcher, entryId]);
  return data;
}
