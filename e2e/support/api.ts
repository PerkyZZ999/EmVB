import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** EmDash REST call as the signed-in admin (the storage-state cookies), with the CSRF header. */
export async function api(
  request: APIRequestContext,
  method: string,
  path: string,
  body?: unknown,
) {
  const response = await request.fetch(path, {
    method,
    headers: {
      "X-EmDash-Request": "1",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { data: JSON.stringify(body) }),
  });
  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: response.status(), json };
}

export const schemaOf = async (request: APIRequestContext) =>
  (await api(request, "GET", "/_emdash/api/schema/collections/emvb_pages?includeFields=true")).json;

/** The schema facts setup is responsible for, without ids and timestamps. */
export function setupFacts(schema: Record<string, unknown> | null) {
  const item = (schema?.["data"] as { item?: Record<string, unknown> } | undefined)?.item;
  if (!item) return null;
  const fields = (item["fields"] as Record<string, unknown>[]).map((f) => ({
    slug: f["slug"],
    type: f["type"],
    widget: f["widget"] ?? null,
    required: Boolean(f["required"]),
    options: (f["validation"] as { options?: string[] } | null)?.options ?? null,
  }));
  return { hidden: item["hidden"], supports: item["supports"], hasSeo: item["hasSeo"], fields };
}

/** Runs EmVB setup from the Visual pages page if the collection doesn't exist yet. */
export async function ensureEmvbSetup(page: Page) {
  await page.goto("/_emdash/admin/plugins/emvb/pages");
  const setupButton = page.getByRole("button", { name: "Set up EmVB" });
  const ready = page.getByText("EmVB is set up.");
  await expect(setupButton.or(ready)).toBeVisible({ timeout: 20_000 });
  if (await setupButton.isVisible()) await setupButton.click();
  await expect(ready).toBeVisible();
}

/** Creates an `emvb_pages` draft over the content API and returns its id. */
export async function createPage(request: APIRequestContext, title: string, layout: unknown) {
  const created = await api(request, "POST", "/_emdash/api/content/emvb_pages", {
    data: { title, layout },
  });
  expect(created.status).toBe(201);
  const id = (created.json?.["data"] as { item?: { id?: string } } | undefined)?.item?.id;
  expect(id).toBeTruthy();
  return id as string;
}
