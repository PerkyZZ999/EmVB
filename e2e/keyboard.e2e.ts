import { expect, test } from "@playwright/test";
import { createPage, ensureEmvbSetup, getPage, parsed } from "./support/api.ts";
import { canvas, overlay, unique } from "./support/helpers.ts";

const EDITOR = "/_emdash/admin/plugins/emvb/editor";

const layoutFor = () => ({
  schemaVersion: 1,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
    children: [
      { id: "head0001", type: "heading", props: { text: "First", level: 1 } },
      { id: "head0002", type: "heading", props: { text: "Second", level: 2 } },
    ],
  },
});

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: test.info().project.use.storageState });
  await ensureEmvbSetup(await context.newPage());
  await context.close();
});

test("keyboard move, duplicate and delete round-trip on save", async ({ page, request }) => {
  const id = await createPage(request, "Keys", layoutFor(), `keys-${unique()}`);
  await page.goto(`${EDITOR}?entry=${id}`);
  await expect(overlay(page).locator(".emvb-topbar-title")).toBeVisible({ timeout: 20_000 });
  await canvas(page).getByRole("heading", { name: "First" }).click();
  await page.keyboard.press("Alt+ArrowDown");
  await page.keyboard.press("Control+d");
  await overlay(page)
    .getByRole("button", { name: /Save draft/ })
    .click();
  await expect(overlay(page).locator(".emvb-save-status")).toContainText("Saved", {
    timeout: 15_000,
  });
  const stored = parsed((await getPage(request, id)).data["layout"]) as {
    root: { children: Array<{ props?: { text?: string } }> };
  };
  expect(stored.root.children.map((c) => c.props?.text)).toEqual(["Second", "First", "First"]);
  // Delete the duplicate (last "First")
  await canvas(page).getByRole("heading", { name: "First" }).last().click();
  await page.keyboard.press("Delete");
  await overlay(page)
    .getByRole("button", { name: /Save draft/ })
    .click();
  await expect(overlay(page).locator(".emvb-save-status")).toContainText("Saved", {
    timeout: 15_000,
  });
  const after = parsed((await getPage(request, id)).data["layout"]) as {
    root: { children: Array<{ props?: { text?: string } }> };
  };
  expect(after.root.children.map((c) => c.props?.text)).toEqual(["Second", "First"]);
});
