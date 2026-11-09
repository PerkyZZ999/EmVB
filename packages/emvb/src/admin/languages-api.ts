import type { Layout } from "../core/schema/layout.ts";
import { requestJson, type Fetcher } from "./api.ts";

/** W-936: the site's languages, from EmDash's manifest; null when the site has no i18n. */
export async function siteLocales(
  fetcher: Fetcher,
): Promise<{ defaultLocale: string; locales: string[] } | null> {
  const data = await requestJson<{ i18n?: { defaultLocale?: string; locales?: string[] } }>(
    fetcher,
    "/_emdash/api/manifest",
  );
  const locales = data.i18n?.locales ?? [];
  if (locales.length < 2 || !data.i18n?.defaultLocale) return null;
  return { defaultLocale: data.i18n.defaultLocale, locales };
}

export type Translation = { id: string; locale: string; slug: string; status: string };

/** Every language of an entry (EmDash's translation group), this one included. */
export async function listTranslations(
  fetcher: Fetcher,
  collection: string,
  id: string,
): Promise<Translation[]> {
  const data = await requestJson<{ translations?: Translation[] }>(
    fetcher,
    `/_emdash/api/content/${collection}/${encodeURIComponent(id)}/translations`,
  );
  return data.translations ?? [];
}

/**
 * Creates the `locale` draft of an entry (D-068: a row per locale, linked by `translationOf`)
 * holding a copy of the layout to translate. Returns the new entry's id.
 */
export async function createTranslation(
  fetcher: Fetcher,
  input: {
    collection: string;
    sourceId: string;
    locale: string;
    title: string;
    slug: string;
    layout: Layout;
  },
): Promise<string> {
  const data = await requestJson<{ item: { id: string } }>(
    fetcher,
    `/_emdash/api/content/${input.collection}`,
    {
      method: "POST",
      body: {
        data: { title: input.title, layout: input.layout },
        slug: input.slug,
        locale: input.locale,
        translationOf: input.sourceId,
      },
    },
  );
  return data.item.id;
}
