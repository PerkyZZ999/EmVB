import { expect, test, type APIRequestContext } from "@playwright/test";
import { api, publishPage, setUpEmvbOnce } from "./support/api.ts";
import { canvas, openEditor, overlay, unique } from "./support/helpers.ts";

/**
 * W-935 (D-068): one EmVB page row per locale. Both demos are English at / and French at /fr/;
 * a page without a French translation falls back to English and says so.
 */

test.describe.configure({ mode: "serial" });
setUpEmvbOnce();

const layoutSaying = (text: string) => ({
  schemaVersion: 18,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "head0001", type: "heading", props: { text, level: 1 } }],
  },
});

async function createIn(
  request: APIRequestContext,
  slug: string,
  text: string,
  locale: string,
  translationOf?: string,
) {
  const created = await api(request, "POST", "/_emdash/api/content/emvb_pages", {
    data: { title: text, layout: layoutSaying(text) },
    slug,
    locale,
    ...(translationOf ? { translationOf } : {}),
  });
  expect(created.status, JSON.stringify(created.json)).toBe(201);
  const id = (created.json?.["data"] as { item?: { id?: string } } | undefined)?.item?.id;
  if (!id) throw new Error("no id");
  await publishPage(request, id);
  return id;
}

test("each language gets its own layout, and a missing translation falls back to English", async ({
  page,
  request,
}) => {
  const slug = `bonjour-${unique()}`;
  const en = await createIn(request, slug, "Hello in English", "en");
  await createIn(request, slug, "Bonjour en français", "fr", en);
  const onlyEnglish = `only-en-${unique()}`;
  await createIn(request, onlyEnglish, "English only", "en");

  await page.goto(`/${slug}`);
  await expect(page.getByRole("heading", { level: 1, name: "Hello in English" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await page.goto(`/fr/${slug}`);
  await expect(page.getByRole("heading", { level: 1, name: "Bonjour en français" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.locator("[data-emvb-fallback]")).toHaveCount(0);

  await page.goto(`/fr/${onlyEnglish}`);
  await expect(page.getByRole("heading", { level: 1, name: "English only" })).toBeVisible();
  await expect(page.locator("[data-emvb-fallback]")).toHaveAttribute("data-emvb-fallback", "en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("W-936: Translate this page makes a linked French draft with the layout and asks the agent", async ({
  page,
  request,
}) => {
  const slug = `traduire-${unique()}`;
  const en = await createIn(request, slug, "Translate me", "en");
  await openEditor(page, en, "Translate me");
  const ui = overlay(page);
  // The editor opens with nothing selected, so the right panel shows Page settings.
  const languages = ui.locator("[data-emvb-languages]");
  await expect(languages).toBeVisible({ timeout: 15_000 });
  await expect(languages.locator('[data-emvb-language="en"]')).toContainText("This page");
  await languages.locator('[data-emvb-language="fr"] [data-emvb-language-translate]').click();

  await expect(page).not.toHaveURL(new RegExp(`entry=${en}`), { timeout: 15_000 });
  await expect(canvas(page).getByRole("heading", { name: "Translate me" })).toBeVisible({
    timeout: 20_000,
  });
  const frId = new URL(page.url()).searchParams.get("entry");
  expect(frId).toBeTruthy();
  expect(frId).not.toBe(en);
  const linked = await api(request, "GET", `/_emdash/api/content/emvb_pages/${frId}/translations`);
  const locales = (
    (linked.json?.["data"] as { translations?: { locale: string }[] } | undefined)?.translations ??
    []
  ).map((t) => t.locale);
  expect(locales.toSorted()).toEqual(["en", "fr"]);
  await ui.getByRole("tab", { name: /^Agent/ }).click();
  await expect(ui.locator('[data-emvb-agent-request="open"]')).toContainText("into French");
});
