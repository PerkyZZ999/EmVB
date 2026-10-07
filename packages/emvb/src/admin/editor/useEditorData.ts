import * as React from "react";
import {
  defaultConditions,
  defaultFloatSettings,
  defaultTriggers,
  validateFloatSettings,
  emptyDesign,
  parseThemePartType,
  validateConditions,
  validateDesign,
  validateLayout,
  validateTriggers,
  type ConditionsDoc,
  type DesignSystem,
  type FloatSettings,
  type Layout,
  type ThemePartType,
  type TriggersDoc,
} from "../../core/index.ts";
import { PAGES_COLLECTION, PLUGIN_ID, THEME_PARTS_COLLECTION } from "../../constants.ts";
import { ApiError, requestJson, type Fetcher } from "../api.ts";
import { entryStatus } from "../entry-status.ts";

export type EditorEntry = {
  id: string;
  collection: string;
  title: string;
  slug: string;
  canvasMode: string;
  seoTitle: string;
  seoDescription: string;
  status: string;
  rev: string | null;
  layout: Layout | null;
  partType?: ThemePartType;
  conditions?: ConditionsDoc;
  triggers?: TriggersDoc;
  float?: FloatSettings;
};

export type LoadedDesign = {
  design: DesignSystem;
  revision: string | null;
  publishedRevision: string | null;
  unpublished: boolean;
};

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
    draftRevisionId?: string | null;
    data?: Record<string, unknown>;
    seo?: { title?: string | null; description?: string | null } | null;
  };
  _rev?: string;
};

const text = (value: unknown) => (typeof value === "string" ? value : "");

export async function loadEntry(
  fetcher: Fetcher,
  id: string,
  collection: string = PAGES_COLLECTION,
): Promise<EditorEntry> {
  const body = await requestJson<ContentResponse>(
    fetcher,
    `/_emdash/api/content/${collection}/${encodeURIComponent(id)}`,
  );
  const data = body?.item?.data ?? {};
  const base: EditorEntry = {
    id: body?.item?.id ?? id,
    collection,
    title: text(data["title"]),
    slug: body?.item?.slug ?? "",
    canvasMode: text(data["canvas_mode"]) || "site-layout",
    seoTitle: text(body?.item?.seo?.title),
    seoDescription: text(body?.item?.seo?.description),
    status: entryStatus(body?.item),
    rev: body?.["_rev"] ?? null,
    layout: readLayout(data["layout"]),
  };
  if (collection !== THEME_PARTS_COLLECTION) return base;
  const conditionsRaw = data["conditions"];
  const validated = validateConditions(
    conditionsRaw === undefined || conditionsRaw === null || conditionsRaw === ""
      ? defaultConditions()
      : conditionsRaw,
  );
  const triggersRaw = data["triggers"];
  const triggersValidated = validateTriggers(
    triggersRaw === undefined || triggersRaw === null || triggersRaw === ""
      ? defaultTriggers()
      : triggersRaw,
  );
  return {
    ...base,
    partType: parseThemePartType(data["part_type"]) ?? "header",
    conditions: validated.ok ? validated.conditions : defaultConditions(),
    triggers: triggersValidated.ok ? triggersValidated.triggers : defaultTriggers(),
    float: readFloat(data["float"]),
  };
}

function readFloat(raw: unknown): FloatSettings {
  const validated = validateFloatSettings(
    raw === undefined || raw === null || raw === "" ? defaultFloatSettings() : raw,
  );
  return validated.ok ? validated.settings : defaultFloatSettings();
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
  const body = await requestJson<{
    design?: unknown;
    revision?: string | null;
    publishedRevision?: string | null;
    unpublished?: boolean;
  }>(fetcher, `/_emdash/api/plugins/${PLUGIN_ID}/design/draft`);
  const result = validateDesign(body?.design);
  return {
    design: result.ok ? result.design : emptyDesign(),
    revision: body?.revision ?? null,
    publishedRevision: body?.publishedRevision ?? null,
    unpublished: body?.unpublished === true,
  };
}

export function useEditorData(
  fetcher: Fetcher,
  entryId: string,
  collection: string = PAGES_COLLECTION,
): EditorData {
  const [data, setData] = React.useState<EditorData>({ state: "loading" });
  React.useEffect(() => {
    let active = true;
    setData({ state: "loading" });
    Promise.all([loadEntry(fetcher, entryId, collection), loadDesign(fetcher)]).then(
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
  }, [fetcher, entryId, collection]);
  return data;
}
