import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

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

/** Runs EmVB setup (or upgrade) from the Visual pages page unless it is already current. */
export async function ensureEmvbSetup(page: Page) {
  await page.goto("/_emdash/admin/plugins/emvb/pages");
  const action = page.getByRole("button", { name: /^(Set up|Upgrade) EmVB$/ });
  const ready = page.locator('[data-emvb-setup="ready"]');
  await expect(action.or(ready)).toBeVisible({ timeout: 20_000 });
  if (await action.isVisible()) await action.click();
  await expect(ready).toBeVisible();
}

/** Runs EmVB setup once before the spec's tests, as the signed-in admin. */
export function setUpEmvbOnce() {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      storageState: test.info().project.use.storageState,
    });
    await ensureEmvbSetup(await context.newPage());
    await context.close();
  });
}

/** Creates a draft in `collection` over the content API and returns its id. */
async function createDraft(
  request: APIRequestContext,
  collection: string,
  data: Record<string, unknown>,
  slug?: string,
) {
  const created = await api(request, "POST", `/_emdash/api/content/${collection}`, {
    data,
    ...(slug ? { slug } : {}),
  });
  expect(created.status).toBe(201);
  const id = (created.json?.["data"] as { item?: { id?: string } } | undefined)?.item?.id;
  expect(id).toBeTruthy();
  return id as string;
}

/** Creates an `emvb_pages` draft over the content API and returns its id. */
export async function createPage(
  request: APIRequestContext,
  title: string,
  layout: unknown,
  slug?: string,
) {
  return createDraft(request, "emvb_pages", { title, layout }, slug);
}

export type StoredPage = {
  slug: string;
  status: string;
  data: Record<string, unknown>;
  liveData?: Record<string, unknown>;
  rev: string;
};

/** The page as the content API returns it to an admin: the draft in `data`, published in `liveData`. */
export async function getPage(request: APIRequestContext, id: string): Promise<StoredPage> {
  const { status, json } = await api(request, "GET", `/_emdash/api/content/emvb_pages/${id}`);
  expect(status).toBe(200);
  const body = json?.["data"] as { item: Omit<StoredPage, "rev">; _rev: string };
  return { ...body.item, rev: body["_rev"] };
}

/** Parses a stored json field, which EmDash may return as a string. */
export const parsed = (value: unknown) =>
  typeof value === "string" ? (JSON.parse(value) as unknown) : value;

/** The page's saved draft layout, typed as the caller reads it. */
export const storedLayout = async <T>(request: APIRequestContext, id: string) =>
  parsed((await getPage(request, id)).data["layout"]) as T;

/** Creates an `emvb_theme_parts` draft over the content API and returns its id. */
export async function createThemePart(
  request: APIRequestContext,
  input: {
    title: string;
    partType: string;
    layout?: unknown;
    slug?: string;
    conditions?: unknown;
    triggers?: unknown;
  },
) {
  return createDraft(
    request,
    "emvb_theme_parts",
    {
      title: input.title,
      layout: input.layout ?? {
        schemaVersion: 10,
        root: {
          id: "root0001",
          type: "container",
          props: {},
          style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
          children: [{ id: "head0001", type: "heading", props: { text: input.title, level: 1 } }],
        },
      },
      part_type: input.partType,
      conditions: input.conditions ?? {
        schemaVersion: 1,
        rules: [
          {
            id: "default-entire",
            op: "include",
            group: "general",
            name: "entire_site",
            args: {},
          },
        ],
      },
      triggers: input.triggers ?? {
        schemaVersion: 1,
        open: [{ type: "page_load" }],
        advanced: {},
      },
    },
    input.slug,
  );
}

/** Publishes a theme part's current draft. */
export async function publishThemePart(request: APIRequestContext, id: string) {
  const { status, json } = await api(request, "GET", `/_emdash/api/content/emvb_theme_parts/${id}`);
  expect(status).toBe(200);
  const body = json?.["data"] as { _rev: string };
  const result = await api(request, "POST", `/_emdash/api/content/emvb_theme_parts/${id}/publish`, {
    _rev: body["_rev"],
  });
  expect(result.status).toBe(200);
}

/** Publishes the page's current draft. */
export async function publishPage(request: APIRequestContext, id: string) {
  const { rev } = await getPage(request, id);
  const result = await api(request, "POST", `/_emdash/api/content/emvb_pages/${id}/publish`, {
    _rev: rev,
  });
  expect(result.status).toBe(200);
}
