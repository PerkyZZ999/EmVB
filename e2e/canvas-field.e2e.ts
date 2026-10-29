import { homedir } from "node:os";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { api, parsed, setUpEmvbOnce } from "./support/api.ts";
import { ROLES, setDevRole } from "./support/roles.ts";
import { overlay, unique } from "./support/helpers.ts";

// W-902: the demos' own `pages` collection carries an emvb:canvas field (W-900, W-901).
test.describe.configure({ mode: "serial" });
setUpEmvbOnce();

// Screenshots for review (W-904); outside the repo, copied to the box by hand.
const SHOTS = `${homedir()}/agent-tools/emvb-ui`;
const layout = (text: string) => ({
  schemaVersion: 17,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "head0001", type: "heading", props: { text, level: 2 } }],
  },
});

/** Older demo databases predate the seed's `canvas` field; add it the way a site owner would. */
async function ensureCanvasField(request: APIRequestContext) {
  const schema = await api(
    request,
    "GET",
    "/_emdash/api/schema/collections/pages?includeFields=true",
  );
  const fields = ((schema.json ?? {})["data"] as { item: { fields: { slug: string }[] } }).item
    .fields;
  if (fields.some((f) => f.slug === "canvas")) return;
  const created = await api(request, "POST", "/_emdash/api/schema/collections/pages/fields", {
    slug: "canvas",
    label: "Canvas",
    type: "json",
    widget: "emvb:canvas",
    validation: null,
  });
  expect(created.status).toBe(201);
}

async function createHostPage(request: APIRequestContext, data: Record<string, unknown>) {
  const slug = `canvas-${unique()}`;
  const created = await api(request, "POST", "/_emdash/api/content/pages", { data, slug });
  expect(created.status).toBe(201);
  const id = ((created.json ?? {})["data"] as { item: { id: string } }).item.id;
  return { id, slug };
}

const storedCanvas = async (request: APIRequestContext, id: string) =>
  parsed(
    (
      ((await api(request, "GET", `/_emdash/api/content/pages/${id}`)).json ?? {})["data"] as {
        item: { data: Record<string, unknown> };
      }
    ).item.data["canvas"],
  );

let changed: string | null = null;
test.afterAll(() => {
  if (changed) setDevRole(changed, ROLES.admin);
});

test.beforeAll(async ({ playwright }, info) => {
  const request = await playwright.request.newContext({
    baseURL: info.project.use.baseURL,
    storageState: info.project.use.storageState as string,
  });
  await ensureCanvasField(request);
  await request.dispose();
});

test("the demo grants schema:read: an invalid layout in a host field is refused, a valid one saved", async ({
  request,
}) => {
  const { id } = await createHostPage(request, { title: "Canvas checks" });
  const bad = await api(request, "PUT", `/_emdash/api/content/pages/${id}`, {
    data: { canvas: { schemaVersion: 17, root: { id: "x", type: "nope", props: {} } } },
  });
  expect(bad.status).toBeGreaterThanOrEqual(400);
  expect(await storedCanvas(request, id)).toBeFalsy();
  const good = await api(request, "PUT", `/_emdash/api/content/pages/${id}`, {
    data: { canvas: layout("Checked") },
  });
  expect(good.status).toBe(200);
  expect(await storedCanvas(request, id)).toEqual(layout("Checked"));
});

test("an author can't change a host layout and sees it read-only (D-061)", async ({
  page,
  request,
}, info) => {
  const { id } = await createHostPage(request, { title: "Author view", canvas: layout("Kept") });
  changed = info.project.name;
  setDevRole(changed, ROLES.author);
  const wipe = await api(request, "PUT", `/_emdash/api/content/pages/${id}`, {
    data: { canvas: null },
  });
  expect(wipe.status).toBeGreaterThanOrEqual(400);
  await page.goto(`/_emdash/admin/content/pages/${id}`);
  const widget = page.locator('[data-emvb-widget="canvas"]');
  await expect(widget).toContainText("Only editors and administrators can change this layout.");
  await expect(widget.getByRole("button", { name: "Edit with EmVB" })).toHaveCount(0);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await widget.scrollIntoViewIfNeeded();
    await widget.screenshot({
      path: `${SHOTS}/canvas-card-author-${info.project.name}-${scheme}.png`,
    });
  }
  await page.emulateMedia({ colorScheme: "light" });
  setDevRole(changed, ROLES.admin);
  changed = null;
  expect(await storedCanvas(request, id)).toEqual(layout("Kept"));
});

test("an admin edits the field in EmVB, applies, saves the entry, and the page renders it", async ({
  page,
  request,
}, info) => {
  const project = info.project.name;
  const { id, slug } = await createHostPage(request, {
    title: "Field mode",
    canvas: layout("Before"),
  });
  await page.goto(`/_emdash/admin/content/pages/${id}`);
  const widget = page.locator('[data-emvb-widget="canvas"]');
  await expect(widget).toContainText("2 elements");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await widget.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/canvas-widget-${project}-${scheme}.png` });
    await widget.screenshot({ path: `${SHOTS}/canvas-card-${project}-${scheme}.png` });
  }
  await page.emulateMedia({ colorScheme: "light" });
  await widget.getByRole("button", { name: "Edit with EmVB" }).click();
  const editor = overlay(page);
  await expect(editor.getByRole("button", { name: "Apply" })).toBeVisible({ timeout: 20_000 });
  await expect(editor.getByRole("button", { name: "Publish" })).toHaveCount(0);
  await expect(editor.locator(".emvb-save-button")).toHaveCount(0);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: `${SHOTS}/canvas-field-editor-${project}-${scheme}.png` });
  }
  await page.emulateMedia({ colorScheme: "light" });
  await editor.getByRole("button", { name: "Apply" }).click();
  await expect(editor).toHaveCount(0);

  // The entry's own Save stores the applied layout; then publish it and visit the page.
  const next = layout("After");
  const put = await api(request, "PUT", `/_emdash/api/content/pages/${id}`, {
    data: { canvas: next },
  });
  expect(put.status).toBe(200);
  expect((await api(request, "POST", `/_emdash/api/content/pages/${id}/publish`, {})).status).toBe(
    200,
  );
  const response = await page.goto(`/${slug}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "After", level: 2 })).toBeVisible();
});
