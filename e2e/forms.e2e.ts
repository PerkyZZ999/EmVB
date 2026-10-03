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

test("published form fields have a bordered default look that a field style and the theme can override (W-114)", async ({
  page,
  request,
}) => {
  const slug = `form-look-${unique()}`;
  const form = await createContactForm(request, slug);
  const layout = formPageLayout(form.id);
  const field = layout.root.children[0]?.children[0] as { style?: object } | undefined;
  if (field) field.style = { color: "#123456", fontSize: { value: 20, unit: "px" } };
  const pageId = await createPage(request, "Form look", layout, `page-${slug}`);
  await publishPage(request, pageId);

  await page.goto(`/page-${slug}`);
  const look = (selector: string) =>
    page.locator(selector).evaluate((el) => {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const parent = (el.parentElement as HTMLElement).getBoundingClientRect();
      return {
        border: style.borderTopWidth,
        radius: style.borderTopLeftRadius,
        padding: style.paddingLeft !== "0px",
        color: style.color,
        fontSize: style.fontSize,
        fillsField: Math.abs(box.width - parent.width) < 1,
      };
    });
  expect(await look('input[name="email"]')).toEqual({
    border: "1px",
    radius: "6px",
    padding: true,
    color: "rgb(18, 52, 86)",
    fontSize: "20px",
    fillsField: true,
  });
  expect((await look('textarea[name="note"]')).radius).toBe("6px");

  await page.addStyleTag({ content: "input{border-radius:0}" });
  expect((await look('input[name="email"]')).radius).toBe("0px");
});
