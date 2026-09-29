import {
  defaultConditionsFor,
  defaultTriggers,
  parseThemePartType,
  starterLayout,
  THEME_PART_TYPE_LABELS,
  type ConditionsDoc,
  type Layout,
  type ThemePartType,
  type TriggersDoc,
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
  triggers: TriggersDoc;
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

type RuleArgs = Record<string, unknown> | undefined;

const arg = (args: RuleArgs, key: string) => String(args?.[key] ?? "?");

/** Short labels for the Theme Builder list, keyed by `group/name`. */
const RULE_LABELS: Record<string, (args: RuleArgs) => string> = {
  "general/entire_site": () => "Entire site",
  "singular/front": () => "Front page",
  "singular/not_found": () => "404",
  "singular/collection": (args) => `Singular: ${arg(args, "collection")}`,
  "singular/entry": (args) => `Entry in ${arg(args, "collection")}`,
  "singular/all": () => "All singular",
  "archive/collection": (args) => `Archive: ${arg(args, "collection")}`,
  "archive/search": () => "Search results",
  "archive/taxonomy": (args) =>
    args?.["slug"] ? `${arg(args, "taxonomy")}:${args["slug"]}` : `All ${arg(args, "taxonomy")}`,
  "archive/all": () => "All archives",
};

function conditionRuleLabel(r: unknown): string {
  const rule = r as { group?: string; name?: string; args?: RuleArgs };
  const key = `${rule.group ?? "?"}/${rule.name ?? "?"}`;
  const label = Object.hasOwn(RULE_LABELS, key) ? RULE_LABELS[key] : undefined;
  return label ? label(rule.args) : key;
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
        triggers: defaultTriggers(),
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
          triggers: draft.triggers,
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
