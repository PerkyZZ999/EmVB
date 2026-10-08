import {
  renderPage,
  validateDesign,
  validateLayout,
  emptyDesign,
  type DesignSystem,
  type FormDefinitions,
  type Layout,
  type PublicFormDefinition,
} from "../../../packages/emvb/src/core/index.ts";
import { PAGES_COLLECTION, THEME_PARTS_COLLECTION } from "../../../packages/emvb/src/constants.ts";
import type { EntryContent, PlaygroundState, StoredEntry } from "./mock/backend.ts";
import { SEED_FORM, SEED_POSTS } from "./mock/seed.ts";

/**
 * The playground's "public site": a page rendered by EmVB's real renderer (`renderPage`, the same
 * call the Astro integration makes), from the playground's saved state, in the browser.
 */

export type ViewTarget = { entry?: string | null; slug?: string | null; draft?: boolean };

export type ViewResult =
  | {
      ok: true;
      title: string;
      description: string;
      html: string;
      css: string;
      dir?: "ltr" | "rtl" | "auto";
      needsTabsRuntime: boolean;
      needsMenuRuntime: boolean;
      needsFormsRuntime: boolean;
      /** True when this is a saved draft rather than what visitors see. */
      draft: boolean;
    }
  | { ok: false; reason: "not-found" | "unpublished" | "unreadable" };

const layoutOf = (content: EntryContent | null): Layout | null => {
  const raw = content?.data["layout"];
  if (raw === null || raw === undefined) return null;
  const result = validateLayout(typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw);
  return result.ok ? result.layout : null;
};

const designOf = (state: PlaygroundState, draft: boolean): DesignSystem => {
  const stored = (draft ? state.design.draft : null) ?? state.design.published;
  const result = validateDesign(stored?.value);
  return result.ok ? result.design : emptyDesign();
};

/** Section and Loop Item parts by id, so synced sections and loop items render. */
function partTemplates(state: PlaygroundState, draft: boolean) {
  const sections: Record<string, Layout> = {};
  const loops: Record<string, Layout> = {};
  for (const part of state.entries) {
    if (part.collection !== THEME_PARTS_COLLECTION) continue;
    const content = draft ? part.draft : part.published;
    const layout = layoutOf(content);
    if (!layout || !content) continue;
    if (content.data["part_type"] === "section") sections[part.id] = layout;
    if (content.data["part_type"] === "loop_item") loops[part.id] = layout;
  }
  return { sections, loops };
}

const FORMS: FormDefinitions = new Map<string, PublicFormDefinition>([
  [SEED_FORM.id, structuredClone(SEED_FORM) as unknown as PublicFormDefinition],
]);

export function findPage(state: PlaygroundState, target: ViewTarget): StoredEntry | undefined {
  const pages = state.entries.filter((e) => e.collection === PAGES_COLLECTION);
  if (target.entry) return pages.find((e) => e.id === target.entry);
  if (target.slug) {
    return (
      pages.find((e) => e.published?.slug === target.slug) ??
      (target.draft ? pages.find((e) => e.draft.slug === target.slug) : undefined)
    );
  }
  return undefined;
}

export function renderView(state: PlaygroundState, target: ViewTarget): ViewResult {
  const entry = findPage(state, target);
  if (!entry) return { ok: false, reason: "not-found" };
  const draft = target.draft === true;
  const content = draft ? entry.draft : entry.published;
  if (!content) return { ok: false, reason: "unpublished" };
  const layout = layoutOf(content);
  if (!layout) return { ok: false, reason: "unreadable" };
  const { sections, loops } = partTemplates(state, draft);
  const rendered = renderPage(layout, designOf(state, draft), {
    formDefinitions: FORMS,
    scope: entry.id,
    dynamic: { posts: [...SEED_POSTS], sectionTemplates: sections, loopTemplates: loops },
  });
  const title = typeof content.data["title"] === "string" ? content.data["title"] : "";
  return {
    ok: true,
    title: content.seo.title || title || "Untitled page",
    description: content.seo.description ?? "",
    html: rendered.html,
    css: rendered.css,
    ...(rendered.dir ? { dir: rendered.dir } : {}),
    needsTabsRuntime: rendered.needsTabsRuntime,
    needsMenuRuntime: rendered.needsMenuRuntime,
    needsFormsRuntime: rendered.needsFormsRuntime,
    draft,
  };
}

/** A downloadable copy of a page's saved layout and the site styles it uses. */
export function exportPage(state: PlaygroundState, entryId: string, now: Date = new Date()) {
  const entry = state.entries.find((e) => e.id === entryId);
  if (!entry) return null;
  const title = typeof entry.draft.data["title"] === "string" ? entry.draft.data["title"] : "";
  const document = {
    format: "emvb-playground-export",
    version: 1,
    exportedAt: now.toISOString(),
    page: {
      title,
      slug: entry.draft.slug,
      canvasMode: entry.draft.data["canvas_mode"] ?? "site-layout",
      seo: entry.draft.seo,
      layout: layoutOf(entry.draft),
    },
    design: designOf(state, true),
  };
  return {
    filename: `emvb-${entry.draft.slug || entry.id}.json`,
    json: `${JSON.stringify(document, null, 2)}\n`,
  };
}
