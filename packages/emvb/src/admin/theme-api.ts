import {
  defaultConditionsFor,
  parseThemePartType,
  starterLayout,
  THEME_PART_TYPE_LABELS,
  type ConditionsDoc,
  type Layout,
  type ThemePartType,
} from "../core/index.ts";
import { THEME_PARTS_COLLECTION } from "../constants.ts";
import { requestJson, type Fetcher } from "./api.ts";

const CONTENT = `/_emdash/api/content/${THEME_PARTS_COLLECTION}`;

type RawItem = {
  id: string;
  slug?: string | null;
  status?: string;
  updatedAt?: string;
  data?: Record<string, unknown>;
};

export type ThemePartSummary = {
  id: string;
  title: string;
  partType: ThemePartType;
  status: string;
  updatedAt: string;
  conditionsSummary: string;
};

export type ThemePartDraft = {
  title: string;
  slug: string;
  partType: ThemePartType;
  conditions: ConditionsDoc;
  layout: Layout | null;
};

const titleOf = (item: RawItem) =>
  typeof item.data?.["title"] === "string" && item.data["title"]
    ? item.data["title"]
    : "Untitled theme part";

function partTypeOf(item: RawItem): ThemePartType {
  return parseThemePartType(item.data?.["part_type"]) ?? "header";
}

export function partTypeLabel(type: ThemePartType): string {
  return THEME_PART_TYPE_LABELS[type];
}

function conditionRuleLabel(r: unknown): string {
  const rule = r as { group?: string; name?: string; args?: Record<string, unknown> };
  if (rule.group === "general" && rule.name === "entire_site") return "Entire site";
  if (rule.group === "singular" && rule.name === "front") return "Front page";
  if (rule.group === "singular" && rule.name === "not_found") return "404";
  if (rule.group === "singular" && rule.name === "collection") {
    return `Singular: ${String(rule.args?.["collection"] ?? "?")}`;
  }
  if (rule.group === "singular" && rule.name === "entry") {
    return `Entry in ${String(rule.args?.["collection"] ?? "?")}`;
  }
  if (rule.group === "archive" && rule.name === "collection") {
    return `Archive: ${String(rule.args?.["collection"] ?? "?")}`;
  }
  if (rule.group === "archive" && rule.name === "search") return "Search results";
  if (rule.group === "archive" && rule.name === "taxonomy") {
    const tax = String(rule.args?.["taxonomy"] ?? "?");
    const slug = rule.args?.["slug"];
    return slug ? `${tax}:${slug}` : `All ${tax}`;
  }
  if (rule.group === "singular" && rule.name === "all") return "All singular";
  if (rule.group === "archive" && rule.name === "all") return "All archives";
  return `${rule.group ?? "?"}/${rule.name ?? "?"}`;
}

export function summarizeConditions(raw: unknown): string {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return "Invalid conditions";
    }
  }
  const rules = (value as { rules?: unknown } | null)?.rules;
  if (!Array.isArray(rules) || rules.length === 0) return "No conditions";
  const includes = rules.filter((r) => (r as { op?: string }).op === "include");
  const excludes = rules.filter((r) => (r as { op?: string }).op === "exclude");
  const parts: string[] = [];
  if (includes.length) parts.push(includes.map(conditionRuleLabel).join(" · "));
  if (excludes.length) parts.push(`Exclude: ${excludes.map(conditionRuleLabel).join(" · ")}`);
  return parts.join(" · ") || "No conditions";
}

export async function listThemeParts(fetcher: Fetcher): Promise<ThemePartSummary[]> {
  const body = await requestJson<{ items?: RawItem[] }>(
    fetcher,
    `${CONTENT}?limit=50&orderBy=updatedAt&order=desc`,
  );
  return (body?.items ?? []).map((item) => ({
    id: item.id,
    title: titleOf(item),
    partType: partTypeOf(item),
    status: item.status ?? "draft",
    updatedAt: item.updatedAt ?? "",
    conditionsSummary: summarizeConditions(item.data?.["conditions"]),
  }));
}

export async function createThemePart(
  fetcher: Fetcher,
  input: { title: string; slug: string; partType: ThemePartType },
): Promise<string> {
  const body = await requestJson<{ item: RawItem }>(fetcher, CONTENT, {
    method: "POST",
    body: {
      data: {
        title: input.title,
        layout: starterLayout(input.title),
        part_type: input.partType,
        conditions: defaultConditionsFor(input.partType),
      },
      slug: input.slug,
    },
  });
  return body.item.id;
}

export async function saveThemePart(
  fetcher: Fetcher,
  id: string,
  draft: ThemePartDraft,
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
          layout: draft.layout,
          part_type: draft.partType,
          conditions: draft.conditions,
        },
        slug: draft.slug,
        ...(rev ? { _rev: rev } : {}),
      },
    },
  );
  return body["_rev"];
}

export async function publishThemePart(fetcher: Fetcher, id: string, rev: string | null) {
  const body = await requestJson<{ _rev: string; item: RawItem }>(
    fetcher,
    `${CONTENT}/${encodeURIComponent(id)}/publish`,
    { method: "POST", body: rev ? { _rev: rev } : {} },
  );
  return { rev: body["_rev"], slug: body.item.slug ?? "" };
}
