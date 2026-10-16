import { expect, test } from "@playwright/test";
import { api, createPage, publishPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import {
  createContactForm,
  expectSubmission,
  formPageLayout,
  submitAsVisitor,
} from "./support/forms.ts";
import { openEditor, openLayers, overlay, saveDraft, unique } from "./support/helpers.ts";

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

test("W-720: choosing a form field replaces an invalid typed name and saves the choice", async ({
  page,
  request,
}) => {
  const slug = `field-recovery-${unique()}`;
  const form = await createContactForm(request, slug);
  const layout = formPageLayout(form.id);
  const formNode = layout.root.children[0];
  if (!formNode) throw new Error("No form fixture");
  formNode.children = formNode.children.filter((node) => node.id !== "txt00001");
  const id = await createPage(request, "Field recovery", layout, slug);
  await openEditor(page, id);
  await openLayers(page);
  await overlay(page).locator('[data-emvb-layer="inp00001"] .emvb-layer-select').click();
  const name = overlay(page).getByRole("textbox", { name: "Field name", exact: true });
  const picker = overlay(page).getByRole("combobox", { name: "Field", exact: true });
  await expect(picker).toContainText("Email *");

  await name.fill("bad name");
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await picker.click();
  await page.getByRole("option", { name: "Note", exact: true }).click();
  await expect(name).toHaveValue("note");
  await expect(name).not.toHaveAttribute("aria-invalid", "true");
  await expect(overlay(page).locator("[data-emvb-field-name-error]")).toHaveCount(0);

  await name.fill("bad name again");
  await picker.click();
  await page.getByRole("option", { name: "Note", exact: true }).click();
  await expect(name).toHaveValue("note");
  await expect(name).not.toHaveAttribute("aria-invalid", "true");
  await expect(picker).toContainText("Note");
  await saveDraft(page);
  const saved = await storedLayout<{
    root: { children: Array<{ children: Array<{ props: { field: string; label: string } }> }> };
  }>(request, id);
  expect(saved.root.children[0]?.children[0]?.props).toMatchObject({
    field: "note",
    label: "Note",
  });
});

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

test("hidden and conditional definition fields work in a live submit (W-595, W-596)", async ({
  page,
  request,
}) => {
  const slug = `form-cond-${unique()}`;
  const created = await api(request, "POST", "/_emdash/api/plugins/emdash-forms/forms/create", {
    name: `EmVB ${slug}`,
    slug,
    pages: [
      {
        fields: [
          {
            id: "f_email",
            type: "email",
            label: "Email",
            name: "email",
            required: true,
            width: "full",
          },
          {
            id: "f_topic",
            type: "select",
            label: "Topic",
            name: "topic",
            required: true,
            width: "full",
            options: [
              { label: "Sales", value: "sales" },
              { label: "Other", value: "other" },
            ],
          },
          {
            id: "f_other",
            type: "text",
            label: "Other",
            name: "other",
            required: true,
            width: "full",
            condition: { field: "topic", op: "eq", value: "other" },
          },
          {
            id: "f_src",
            type: "hidden",
            label: "Source",
            name: "source",
            required: false,
            width: "full",
            defaultValue: "emvb-e2e",
          },
        ],
      },
    ],
    settings: {
      confirmationMessage: "Thanks — EmVB received your message.",
      spamProtection: "none",
      submitLabel: "Send",
      notifyEmails: [],
      digestEnabled: false,
      digestHour: 9,
      retentionDays: 0,
    },
  });
  expect(created.status, JSON.stringify(created.json)).toBe(200);
  const formId = (created.json?.["data"] as { id?: string } | undefined)?.id ?? "";
  const base = formPageLayout(formId);
  const fields = [
    { id: "inp00001", type: "text-input", props: { field: "email", label: "Email" } },
    { id: "sel00001", type: "select", props: { field: "topic", label: "Topic" } },
    { id: "inp00002", type: "text-input", props: { field: "other", label: "Other" } },
    { id: "sub00001", type: "submit", props: { label: "Send" } },
  ];
  const layout = {
    ...base,
    root: {
      ...base.root,
      children: [{ id: "form0001", type: "form", props: { formId }, children: fields }],
    },
  };
  const pageId = await createPage(request, "Form Cond", layout, `page-${slug}`);
  await publishPage(request, pageId);

  await page.goto(`/page-${slug}`);
  await expect(page.locator("[data-ec-form][data-ec-initialized]")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('input[name="other"]')).toBeHidden();
  await page.locator('input[name="email"]').fill(`cond-${slug}@example.com`);
  await page.locator('select[name="topic"]').selectOption("sales");
  await page.locator(".ec-form-submit").click();
  await expect(page.locator("[data-form-status]")).toContainText(/EmVB received/, {
    timeout: 15_000,
  });

  const listed = await api(request, "POST", "/_emdash/api/plugins/emdash-forms/submissions/list", {
    formId,
    limit: 20,
  });
  const listedData = listed.json?.["data"] as
    | { items?: Array<{ data: Record<string, unknown> }> }
    | undefined;
  const items = listedData?.items ?? [];
  const mine = items.find((i) => i.data["email"] === `cond-${slug}@example.com`);
  expect(mine?.data["topic"]).toBe("sales");
  expect(mine?.data["source"]).toBe("emvb-e2e");
});
