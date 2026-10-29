import { PLUGIN_ID } from "../../constants.ts";
import { canvasCollectionSlugs, canvasStyleUrls } from "../../core/index.ts";
import { requestJson, type Fetcher } from "../api.ts";
import { readCollection } from "./run.ts";

const CANVAS_WIDGET = `${PLUGIN_ID}:canvas`;
const BASE = "/_emdash/api/schema/collections";

/** The field setup adds (W-913): the same JSON field the demos' `pages` collection carries. */
export const CANVAS_FIELD_BODY = {
  slug: "canvas",
  label: "Canvas",
  type: "json",
  widget: CANVAS_WIDGET,
  validation: null,
} as const;

export type HostCollectionRow = {
  slug: string;
  label: string;
  /** ready: an emvb:canvas field exists; missing: setup can add one; taken: `canvas` is another field. */
  field: "ready" | "missing" | "taken";
  /** The field holding the layout when ready. */
  fieldSlug?: string;
  /** Listed in the running site's `canvasCollections` option. */
  listed: boolean;
};

type CollectionSummary = { slug: string; label?: string; hidden?: boolean };
type FieldSummary = { slug: string; type: string; widget?: string | null };

/** One row per visible host collection; EmVB's own (hidden) collections are left out. */
export function hostCollectionRows(
  collections: readonly (CollectionSummary & { fields: readonly FieldSummary[] })[],
  configured: readonly string[],
): HostCollectionRow[] {
  return collections
    .filter((c) => !c.hidden && canvasCollectionSlugs([c.slug]).length === 1)
    .map((c) => {
      const canvas = c.fields.find((f) => f.type === "json" && f.widget === CANVAS_WIDGET);
      const taken = c.fields.some((f) => f.slug === CANVAS_FIELD_BODY.slug);
      const row: HostCollectionRow = {
        slug: c.slug,
        label: c.label?.trim() || c.slug,
        field: canvas ? "ready" : taken ? "taken" : "missing",
        listed: configured.includes(c.slug),
      };
      if (canvas) row.fieldSlug = canvas.slug;
      return row;
    });
}

/**
 * The `emvb()` call for astro.config with every collection that has the field. `canvasCollections`
 * is read when the site starts, so setup can only show it; the current `canvasStyles` are kept.
 */
export function canvasCollectionsSnippet(
  rows: readonly HostCollectionRow[],
  canvasStyles: readonly string[],
): string {
  const slugs = rows.filter((r) => r.field === "ready" || r.listed).map((r) => r.slug);
  const options = [
    ...(canvasStyles.length > 0 ? [`canvasStyles: ${JSON.stringify(canvasStyles)}`] : []),
    `canvasCollections: ${JSON.stringify(slugs)}`,
  ];
  return `// astro.config.mjs, in emdash({ plugins: [...] })\nemvb({ ${options.join(", ")} })`;
}

export async function loadHostCollections(fetcher: Fetcher): Promise<{
  rows: HostCollectionRow[];
  canvasStyles: string[];
}> {
  const [list, config] = await Promise.all([
    requestJson<{ items: CollectionSummary[] }>(fetcher, BASE),
    requestJson<{ canvasStyles?: unknown; canvasCollections?: unknown }>(
      fetcher,
      `/_emdash/api/plugins/${PLUGIN_ID}/editor/config`,
    ).catch(() => ({}) as { canvasStyles?: unknown; canvasCollections?: unknown }),
  ]);
  const visible = list.items.filter((c) => !c.hidden);
  const detailed = await Promise.all(
    visible.map(async (c) => ({
      slug: c.slug,
      label: c.label,
      fields: (await readCollection(fetcher, c.slug))?.fields ?? [],
    })),
  );
  return {
    rows: hostCollectionRows(detailed, canvasCollectionSlugs(config.canvasCollections)),
    canvasStyles: canvasStyleUrls(config.canvasStyles),
  };
}

/** Adds the canvas field through EmDash's schema API (schema:manage, admins). */
export async function addCanvasField(fetcher: Fetcher, collection: string): Promise<void> {
  await requestJson(fetcher, `${BASE}/${encodeURIComponent(collection)}/fields`, {
    method: "POST",
    body: CANVAS_FIELD_BODY,
  });
}
