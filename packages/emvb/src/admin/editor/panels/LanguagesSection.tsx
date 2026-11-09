import { Badge, Button, Checkbox } from "@cloudflare/kumo";
import { TranslateIcon } from "@phosphor-icons/react";
import * as React from "react";
import type { Layout } from "../../../core/schema/layout.ts";
import { translatableStrings } from "../../../core/translatable.ts";
import type { Fetcher } from "../../api.ts";
import { ApiError } from "../../api.ts";
import {
  createTranslation,
  listTranslations,
  siteLocales,
  type Translation,
} from "../../languages-api.ts";
import { createRequest } from "../../proposals-api.ts";
import { editorUrl } from "../exit.ts";

const nameOf = (locale: string) => {
  try {
    return new Intl.DisplayNames(undefined, { type: "language" }).of(locale) ?? locale;
  } catch {
    return locale;
  }
};

/**
 * W-936 Translate this page (D-068): each language is its own entry. A missing one is created as
 * a draft copy of this layout (EmDash's `translationOf`) and opened; optionally the person's agent
 * is asked to translate it, and its proposal is reviewed in the new page's Agent tab.
 */
export function LanguagesSection({
  fetcher,
  collection,
  entryId,
  title,
  slug,
  layout,
  navigate = (url) => window.location.assign(url),
}: {
  fetcher: Fetcher;
  collection: string;
  entryId: string;
  title: string;
  slug: string;
  layout: Layout | null;
  navigate?: (url: string) => void;
}) {
  const [site, setSite] = React.useState<{ defaultLocale: string; locales: string[] } | null>(null);
  const [translations, setTranslations] = React.useState<Translation[]>([]);
  const [askAgent, setAskAgent] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    siteLocales(fetcher)
      .then(async (locales) => {
        if (cancelled || !locales) return;
        setSite(locales);
        const list = await listTranslations(fetcher, collection, entryId);
        if (!cancelled) setTranslations(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fetcher, collection, entryId]);
  if (!site) return null;
  const current = translations.find((t) => t.id === entryId)?.locale ?? site.defaultLocale;
  const texts = layout ? translatableStrings(layout).length : 0;

  const translate = async (locale: string) => {
    if (!layout || busy) return;
    setBusy(locale);
    setError(null);
    try {
      const id = await createTranslation(fetcher, {
        collection,
        sourceId: entryId,
        locale,
        title,
        slug,
        layout,
      });
      if (askAgent) {
        await createRequest(
          fetcher,
          collection,
          id,
          `Translate this page from ${nameOf(current)} (${current}) into ${nameOf(locale)} (${locale}). Change only the words (${texts} texts: headings, text, buttons, alt text, labels); keep the layout, links, images and styles.`,
        ).catch(() => undefined);
      }
      navigate(editorUrl(id, collection));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't create the translation. Try again.");
      setBusy(null);
    }
  };

  return (
    <section className="emvb-field-group" aria-label="Languages" data-emvb-languages="">
      <span className="emvb-field-label">Languages</span>
      <ul className="emvb-codesign-ops">
        {site.locales.map((locale) => {
          const found = translations.find((t) => t.locale === locale);
          return (
            <li key={locale} className="emvb-codesign-op" data-emvb-language={locale}>
              <span className="emvb-codesign-op-text">
                {nameOf(locale)} <span className="emvb-helper">({locale})</span>
              </span>
              <span className="emvb-codesign-op-actions">
                {locale === current ? (
                  <Badge variant="blue">This page</Badge>
                ) : found ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    data-emvb-language-open=""
                    onClick={() => navigate(editorUrl(found.id, collection))}
                  >
                    Open
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<TranslateIcon aria-hidden="true" />}
                    aria-busy={busy === locale || undefined}
                    disabled={!layout || (busy !== null && busy !== locale)}
                    data-emvb-language-translate=""
                    onClick={() => void translate(locale)}
                  >
                    Translate
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {site.locales.some((l) => l !== current && !translations.some((t) => t.locale === l)) && (
        <Checkbox
          label="Ask my agent to translate the new page"
          checked={askAgent}
          onCheckedChange={(checked: boolean) => setAskAgent(checked)}
        />
      )}
      <p className="emvb-helper" role={error ? "alert" : undefined}>
        {error ??
          `Translate copies this page's layout into a draft in that language (${texts} texts to translate), then opens it.`}
      </p>
    </section>
  );
}
