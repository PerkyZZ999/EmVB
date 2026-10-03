import { expect, test } from "@playwright/test";
import { api, schemaOf, setupFacts } from "./support/api.ts";

const PAGES = "/_emdash/admin/plugins/emvb/pages";

test.describe.configure({ mode: "serial" });

test("an admin sets up EmVB, and upgrading an altered schema converges to the same result", async ({
  page,
  request,
}) => {
  await page.goto(PAGES);
  const setupButton = page.getByRole("button", { name: "Set up EmVB" });
  const ready = page.locator('[data-emvb-setup="ready"]');
  await expect(setupButton.or(ready)).toBeVisible({ timeout: 20_000 });
  if (await setupButton.isVisible()) await setupButton.click();
  await expect(ready).toBeVisible();

  const first = setupFacts(await schemaOf(request));
  expect(first).toEqual({
    hidden: true,
    supports: expect.arrayContaining(["drafts", "revisions", "preview"]),
    hasSeo: true,
    fields: expect.arrayContaining([
      expect.objectContaining({ slug: "title", type: "string" }),
      expect.objectContaining({ slug: "layout", type: "json", widget: "emvb:layout" }),
      expect.objectContaining({
        slug: "canvas_mode",
        type: "select",
        options: ["site-layout", "blank"],
      }),
    ]),
  });

  // Undo part of the setup by hand, then run it again from the UI.
  expect(
    (await api(request, "PUT", "/_emdash/api/schema/collections/emvb_pages", { hidden: false }))
      .status,
  ).toBe(200);
  expect(
    (
      await api(request, "PUT", "/_emdash/api/schema/collections/emvb_pages/fields/layout", {
        widget: "",
        validation: null,
      })
    ).status,
  ).toBe(200);
  await page.reload();
  await page.getByRole("button", { name: "Upgrade EmVB" }).click();
  await expect(ready).toBeVisible();
  expect(setupFacts(await schemaOf(request))).toEqual(first);
});

test("the hidden collection has no sidebar link, and Visual pages does", async ({ page }) => {
  await page.goto("/_emdash/admin");
  const nav = page.getByRole("complementary", { name: "Admin navigation" });
  await expect(nav.getByRole("link", { name: "Pages VisualBuilder" })).toHaveAttribute(
    "href",
    "/_emdash/admin/plugins/emvb/pages",
  );
  const emvb = nav.locator("[data-emvb-nav]");
  await expect(emvb).toContainText("EmVB");
  await expect(emvb.getByRole("link", { name: "Pages VisualBuilder" })).toBeVisible();
  await expect(emvb.getByRole("link", { name: "Theme Builder" })).toBeVisible();
  await expect(nav.locator('a[href*="/content/emvb_pages"]')).toHaveCount(0);
});

test("saves are validated over HTTP: an invalid layout gets 422 SAVE_REJECTED", async ({
  request,
}) => {
  const invalid = {
    schemaVersion: 9,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [{ id: "h1", type: "heading", props: {} }],
    },
  };
  const result = await api(request, "POST", "/_emdash/api/content/emvb_pages", {
    data: { title: "Bad", layout: invalid },
  });
  expect(result.status).toBe(422);
  expect(result.json).toMatchObject({ error: { code: "SAVE_REJECTED" } });
  expect(JSON.stringify(result.json)).toContain("root.children[0]");
});

test("the standard entry editor shows the read-only widget instead of a JSON input", async ({
  page,
  request,
}) => {
  const layout = {
    schemaVersion: 9,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [{ id: "head0001", type: "heading", props: { text: "Hi", level: 1 } }],
    },
  };
  const created = await api(request, "POST", "/_emdash/api/content/emvb_pages", {
    data: { title: "Widget check", layout },
  });
  expect(created.status).toBe(201);
  const data = created.json?.["data"] as { item?: { id?: string } } | undefined;
  const id = data?.item?.id;
  expect(id).toBeTruthy();

  await page.goto(`/_emdash/admin/content/emvb_pages/${id}`);
  const widget = page.locator('[data-emvb-widget="layout"]');
  await expect(widget).toBeVisible({ timeout: 20_000 });
  await expect(widget).toContainText("2 elements · schema 5");
  await expect(widget.getByRole("link", { name: "Open in EmVB" })).toHaveAttribute(
    "href",
    `/_emdash/admin/plugins/emvb/editor?entry=${id}`,
  );
  await expect(
    page.locator('textarea[id*="layout" i], input[id*="layout" i], [name="layout"]'),
  ).toHaveCount(0);
  await expect(page.getByText('"schemaVersion"')).toHaveCount(0);
});
