import { validateLayout, type Layout } from "../core/index.ts";
import { layoutToPortableText } from "../core/portable-text-export.ts";
import { THEME_PARTS_COLLECTION } from "../constants.ts";
import { ApiError, listAllItems, requestJson, type Fetcher } from "./api.ts";
import type { ContentItem } from "./content-item.ts";
import { loadExportData } from "./export-api.ts";
import { siteLocales } from "./languages-api.ts";
import { readCollection } from "./setup/run.ts";

export type RichTextTarget = {
  slug: string;
  label: string;
  /** The Portable Text field the words go into (`content` first). */
  field: string;
  /** The collection has a `title` field for the page title. */
  hasTitle: boolean;
  /**
   * W-1091: false when the rich-text field is shared by every language of an entry (EmDash's
   * per-field `translatable`); then only the default language is copied.
   */
  translatable?: boolean;
  /** W-1091: false when the title is shared by every language (a translation must not send it). */
  titleTranslatable?: boolean;
};

/** Visible collections with a rich-text field: where EmVB pages can be copied as rich text. */
export async function richTextTargets(fetcher: Fetcher): Promise<RichTextTarget[]> {
  const list = await requestJson<{ items: { slug: string; label?: string; hidden?: boolean }[] }>(
    fetcher,
    "/_emdash/api/schema/collections",
  );
  const rows = await Promise.all(
    list.items
      .filter((c) => !c.hidden)
      .map(async (c) => {
        const fields = (await readCollection(fetcher, c.slug))?.fields ?? [];
        const rich = fields.filter((f) => f.type === "portableText");
        const field = rich.find((f) => f.slug === "content") ?? rich[0];
        if (!field) return null;
        const title = fields.find((f) => f.slug === "title");
        const target: RichTextTarget = {
          slug: c.slug,
          label: c.label?.trim() || c.slug,
          field: field.slug,
          hasTitle: !!title,
        };
        if (field.translatable === false) target.translatable = false;
        if (title?.translatable === false) target.titleTranslatable = false;
        return target;
      }),
  );
  return rows.filter((row): row is RichTextTarget => row !== null);
}

export type CopyResult = {
  /** W-1091: `locale` is set when the site has languages; the title then names it. */
  created: { title: string; id: string; locale?: string }[];
  failed: { title: string; message: string }[];
  /** Elements left out across all pages, by type. */
  skipped: Record<string, number>;
};

type Page = Awaited<ReturnType<typeof loadExportData>>["pages"][number];

/**
 * W-1091 (#26): the pages in the order they are copied, grouped by translation: in each group the
 * default language first, so the others can be created as its translations. With `onlyDefault`,
 * the other languages are set aside (returned in `rest`).
 */
function translationOrder(
  pages: readonly Page[],
  defaultLocale: string,
  onlyDefault: boolean,
): { copy: Page[]; rest: Page[] } {
  const groups = new Map<string, Page[]>();
  for (const page of pages) {
    const group = page.translationGroup || page.id;
    groups.set(group, [...(groups.get(group) ?? []), page]);
  }
  const copy: Page[] = [];
  const rest: Page[] = [];
  for (const [group, members] of groups) {
    const rank = (p: Page) => (p.locale === defaultLocale ? 0 : p.id === group ? 1 : 2);
    const ordered = members.toSorted(
      (a, b) => rank(a) - rank(b) || (a.locale ?? "").localeCompare(b.locale ?? ""),
    );
    if (onlyDefault) {
      const [first, ...others] = ordered;
      if (first) copy.push(first);
      rest.push(...others);
    } else copy.push(...ordered);
  }
  return { copy, rest };
}

/**
 * W-963: published EmVB pages (all or one) become draft entries in another collection, their
 * words, headings, lists, links and images as rich text. EmVB pages are only read; nothing is
 * published. A page whose entry can't be created (a slug in use) is reported and the rest go on.
 *
 * W-1091 (#26): on a site with languages each page keeps its own: one entry per language, in that
 * locale, with that language's words, created as a translation of the default language's entry
 * (slugs are unique per language in EmDash, so translations share theirs). When the target's
 * rich-text field is shared across languages, or the site has no languages set up, only one
 * language per page is copied and the others are reported, never written under another locale.
 */
export async function copyPagesAsRichText(
  fetcher: Fetcher,
  target: RichTextTarget,
  onlyPageId?: string | readonly string[],
): Promise<CopyResult> {
  const [{ pages }, partItems, languages] = await Promise.all([
    loadExportData(fetcher, onlyPageId),
    listAllItems<ContentItem>(fetcher, `/_emdash/api/content/${THEME_PARTS_COLLECTION}`),
    siteLocales(fetcher).catch(() => null),
  ]);
  const sectionTemplates: Record<string, Layout> = {};
  for (const part of partItems) {
    if (part.status !== "published" || part.data?.["part_type"] !== "section") continue;
    const checked = validateLayout(part.data["layout"]);
    if (checked.ok) sectionTemplates[part.id] = checked.layout;
  }
  const result: CopyResult = { created: [], failed: [], skipped: {} };
  const defaultLocale = languages?.defaultLocale ?? "en";
  const perLanguage = !!languages && target.translatable !== false;
  const { copy, rest } = translationOrder(pages, defaultLocale, !perLanguage);
  // A page's title names its language when the pages have more than one.
  const multilingual = new Set(pages.map((p) => p.locale ?? defaultLocale)).size > 1;
  const named = (page: Page) =>
    multilingual && page.locale ? `${page.title} (${page.locale})` : page.title;
  for (const page of rest) {
    result.failed.push({
      title: named(page),
      message: languages
        ? `${target.label} shares its ${target.field} field across languages, so only the ${defaultLocale} page was copied`
        : "this site has no languages set up, so only one language of each page was copied",
    });
  }
  // Translation group → the entry its first language became.
  const sources = new Map<string, string>();
  for (const page of copy) {
    const group = page.translationGroup || page.id;
    const locale = languages ? page.locale || defaultLocale : undefined;
    if (locale && languages && !languages.locales.includes(locale)) {
      result.failed.push({
        title: named(page),
        message: `its language (${locale}) isn't set up on this site`,
      });
      continue;
    }
    let raw = page.layout;
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw) as unknown;
      } catch {
        raw = null;
      }
    }
    const checked = validateLayout(raw);
    if (!checked.ok) {
      result.failed.push({ title: named(page), message: "its layout couldn't be read" });
      continue;
    }
    const converted = layoutToPortableText(checked.layout, { sectionTemplates });
    for (const [type, n] of Object.entries(converted.skipped))
      result.skipped[type] = (result.skipped[type] ?? 0) + n;
    const source = sources.get(group);
    // A title shared by every language comes from the entry it translates.
    const sendTitle = target.hasTitle && !(source && target.titleTranslatable === false);
    try {
      // oxlint-disable-next-line no-await-in-loop -- one entry at a time; failures are per page
      const body = await requestJson<{ item: { id: string } }>(
        fetcher,
        `/_emdash/api/content/${encodeURIComponent(target.slug)}`,
        {
          method: "POST",
          body: {
            data: {
              ...(sendTitle ? { title: page.title } : {}),
              [target.field]: converted.body,
            },
            ...(page.slug ? { slug: page.slug } : {}),
            ...(locale ? { locale } : {}),
            ...(locale && source ? { translationOf: source } : {}),
          },
        },
      );
      if (!sources.has(group)) sources.set(group, body.item.id);
      result.created.push({
        title: named(page),
        id: body.item.id,
        ...(locale ? { locale } : {}),
      });
    } catch (error) {
      result.failed.push({
        title: named(page),
        message:
          error instanceof ApiError && error.status === 409
            ? locale && multilingual
              ? `its address is already used there in ${locale}`
              : "its address is already used there"
            : error instanceof Error
              ? error.message
              : String(error),
      });
    }
  }
  return result;
}
