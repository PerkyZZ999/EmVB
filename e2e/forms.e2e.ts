import { expect, test } from "@playwright/test";
import { api, createPage, ensureEmvbSetup, getPage } from "./support/api.ts";
import { createContactForm, formPageLayout, listSubmissions } from "./support/forms.ts";

const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: test.info().project.use.storageState });
  await ensureEmvbSetup(await context.newPage());
  await context.close();
});

async function publish(request: Parameters<typeof getPage>[0], id: string) {
  const { rev } = await getPage(request, id);
  const result = await api(request, "POST", `/_emdash/api/content/emvb_pages/${id}/publish`, {
    _rev: rev,
  });
  expect(result.status).toBe(200);
}

test("integration POST submit succeeds with EmVB-bound field names", async ({ request }) => {
  const slug = `form-api-${unique()}`;
  const form = await createContactForm(request, slug);
  const pageId = await createPage(request, "Form API", formPageLayout(form.id), `page-${slug}`);
  await publish(request, pageId);

  const html = await (await request.get(`/page-${slug}`)).text();
  expect(html).toContain("data-ec-form");
  expect(html).toContain(`data-form-id="${form.id}"`);
  expect(html).toContain('name="email"');

  const submitted = await api(request, "POST", "/_emdash/api/plugins/emdash-forms/submit", {
    formId: form.id,
    data: { email: `visitor-${slug}@example.com`, note: "hello from API" },
  });
  expect(submitted.status, JSON.stringify(submitted.json)).toBe(200);
  const body = submitted.json?.["data"] as { success?: boolean; message?: string } | undefined;
  expect(body?.success).toBe(true);
  expect(body?.message).toContain("EmVB received");

  const items = await listSubmissions(request, form.id);
  expect(items.some((item) => item.data?.["email"] === `visitor-${slug}@example.com`)).toBe(true);
});

test("visitor can fill and submit a published EmVB form", async ({ page, request }) => {
  const slug = `form-ui-${unique()}`;
  const form = await createContactForm(request, slug);
  const pageId = await createPage(request, "Form UI", formPageLayout(form.id), `page-${slug}`);
  await publish(request, pageId);

  await page.goto(`/page-${slug}`);
  await expect(page.locator("[data-ec-form]")).toBeVisible();
  await expect(page.locator("[data-ec-form][data-ec-initialized]")).toBeVisible({
    timeout: 15_000,
  });
  await page.locator('input[name="email"]').fill(`ui-${slug}@example.com`);
  await page.locator('textarea[name="note"]').fill("hello from browser");
  await page.locator(".ec-form-submit").click();
  await expect(page.locator("[data-form-status]")).toContainText(/EmVB received|success|Thank/i, {
    timeout: 15_000,
  });

  const items = await listSubmissions(request, form.id);
  expect(items.some((item) => item.data?.["email"] === `ui-${slug}@example.com`)).toBe(true);
});
