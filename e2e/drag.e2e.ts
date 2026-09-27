import { expect, test, type Page } from "@playwright/test";
import { createPage, ensureEmvbSetup, getPage, parsed } from "./support/api.ts";

const EDITOR = "/_emdash/admin/plugins/emvb/editor";

const layoutFor = (first: string, second: string) => ({
  schemaVersion: 1,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
    children: [
      { id: "head0001", type: "heading", props: { text: first, level: 1 } },
      { id: "head0002", type: "heading", props: { text: second, level: 2 } },
    ],
  },
});

const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: test.info().project.use.storageState });
  await ensureEmvbSetup(await context.newPage());
  await context.close();
});

const overlay = (page: Page) => page.locator("[data-emvb-editor]");
const canvas = (page: Page) => page.frameLocator("iframe[data-emvb-canvas]");

async function openEditor(page: Page, id: string, first: string) {
  await page.goto(`${EDITOR}?entry=${id}`);
  await expect(overlay(page).locator(".emvb-topbar-title")).toBeVisible({ timeout: 20_000 });
  await expect(canvas(page).getByRole("heading", { name: first })).toBeVisible();
}

/**
 * Native HTML5 drag from the Add tile into the canvas iframe (K16 / W-015).
 * Uses a real mouse path so the browser fills dataTransfer from dragstart.
 */
async function dragHeadingTo(page: Page, pageX: number, pageY: number) {
  const tile = overlay(page).locator('[data-emvb-add-tile="heading"]');
  await expect(tile).toBeVisible();
  const tileBox = await tile.boundingBox();
  if (!tileBox) throw new Error("Add tile has no box");
  await page.mouse.move(tileBox.x + tileBox.width / 2, tileBox.y + tileBox.height / 2);
  await page.mouse.down();
  // Real mouse path so Chromium runs HTML5 DnD with the tile's dragstart dataTransfer.
  await page.mouse.move(pageX, pageY, { steps: 16 });
  await page.mouse.up();
}

test("dragging Heading onto the canvas inserts at the pointed index and saves", async ({
  page,
  request,
}) => {
  const first = "Alpha";
  const second = "Beta";
  const id = await createPage(request, "Drag check", layoutFor(first, second), `drag-${unique()}`);
  await openEditor(page, id, first);

  const firstHeading = canvas(page).getByRole("heading", { name: first });
  const firstBox = await firstHeading.boundingBox();
  if (!firstBox) throw new Error("First heading has no box");
  // Drop just below Alpha so the index is between Alpha and Beta.
  await dragHeadingTo(page, firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height + 8);

  await expect(canvas(page).getByRole("heading", { name: "Heading" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(overlay(page).locator(".emvb-overlay-label")).toContainText("Heading");

  await overlay(page)
    .getByRole("button", { name: /Save draft/ })
    .click();
  await expect(overlay(page).locator(".emvb-save-status")).toContainText("Saved", {
    timeout: 15_000,
  });

  const stored = parsed((await getPage(request, id)).data["layout"]) as {
    root: { children: Array<{ type: string; props?: { text?: string } }> };
  };
  expect(stored.root.children.map((child) => child.type)).toEqual([
    "heading",
    "heading",
    "heading",
  ]);
  expect(stored.root.children.map((child) => child.props?.text)).toEqual([
    first,
    "Heading",
    second,
  ]);
});
