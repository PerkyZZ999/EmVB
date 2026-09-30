import { expect, test } from "@playwright/test";
import { api, createPage, publishPage, setUpEmvbOnce } from "./support/api.ts";
import {
  createContactForm,
  expectSubmission,
  formPageLayout,
  submitAsVisitor,
} from "./support/forms.ts";
import { unique } from "./support/helpers.ts";

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

test("integration POST submit succeeds with EmVB-bound field names", async ({ request }) => {
  const slug = `form-api-${unique()}`;
  const form = await createContactForm(request, slug);
  const pageId = await createPage(request, "Form API", formPageLayout(form.id), `page-${slug}`);
  await publishPage(request, pageId);

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

  await expectSubmission(request, form.id, `visitor-${slug}@example.com`);
});

test("visitor can fill and submit a published EmVB form", async ({ page, request }) => {
  const slug = `form-ui-${unique()}`;
  const form = await createContactForm(request, slug);
  const pageId = await createPage(request, "Form UI", formPageLayout(form.id), `page-${slug}`);
  await publishPage(request, pageId);

  await page.goto(`/page-${slug}`);
  await expect(page.locator("[data-ec-form]")).toBeVisible();
  await submitAsVisitor(page, `ui-${slug}@example.com`, "hello from browser");
  await expectSubmission(request, form.id, `ui-${slug}@example.com`);
});
