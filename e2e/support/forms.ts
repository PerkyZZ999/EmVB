import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { api } from "./api.ts";

const FORMS = "/_emdash/api/plugins/emdash-forms";

export type CreatedForm = { id: string; slug: string; name: string };

/** Creates a minimal active forms-plugin form (email + optional note) for EmVB e2e (W-037). */
export async function createContactForm(
  request: APIRequestContext,
  slug: string,
): Promise<CreatedForm> {
  const name = `EmVB ${slug}`;
  const created = await api(request, "POST", `${FORMS}/forms/create`, {
    name,
    slug,
    pages: [
      {
        fields: [
          {
            id: "fld_email",
            type: "email",
            label: "Email",
            name: "email",
            required: true,
            width: "full",
          },
          {
            id: "fld_note",
            type: "textarea",
            label: "Note",
            name: "note",
            required: false,
            width: "full",
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
  const data = created.json?.["data"] as { id?: string } | undefined;
  const id = data?.id;
  expect(id).toBeTruthy();
  if (!id) throw new Error("forms/create returned no id");
  return { id, slug, name };
}

async function listSubmissions(request: APIRequestContext, formId: string) {
  const listed = await api(request, "POST", `${FORMS}/submissions/list`, {
    formId,
    limit: 20,
  });
  expect(listed.status, JSON.stringify(listed.json)).toBe(200);
  const data = listed.json?.["data"] as {
    items?: Array<{ id: string; data: Record<string, unknown> }>;
  };
  return data?.items ?? [];
}

/** Asserts the form has a submission from `email`. */
export async function expectSubmission(request: APIRequestContext, formId: string, email: string) {
  const items = await listSubmissions(request, formId);
  expect(items.some((item) => item.data?.["email"] === email)).toBe(true);
}

/** Fills and submits the published EmVB form on `page` as a visitor, and waits for the thanks. */
export async function submitAsVisitor(page: Page, email: string, note?: string) {
  await expect(page.locator("[data-ec-form][data-ec-initialized]")).toBeVisible({
    timeout: 15_000,
  });
  await page.locator('input[name="email"]').fill(email);
  if (note !== undefined) await page.locator('textarea[name="note"]').fill(note);
  await page.locator(".ec-form-submit").click();
  await expect(page.locator("[data-form-status]")).toContainText(/EmVB received|success|Thank/i, {
    timeout: 15_000,
  });
}

/** EmVB layout bound to a forms-plugin form id (email + note + submit). */
export const formPageLayout = (formId: string) => ({
  schemaVersion: 7,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
    children: [
      {
        id: "form0001",
        type: "form",
        props: { formId },
        children: [
          {
            id: "inp00001",
            type: "text-input",
            props: { field: "email", label: "Email", placeholder: "you@example.com" },
          },
          {
            id: "txt00001",
            type: "textarea",
            props: { field: "note", label: "Note" },
          },
          { id: "sub00001", type: "submit", props: { label: "Send" } },
        ],
      },
    ],
  },
});
