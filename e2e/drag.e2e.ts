import { expect, test, type Page } from "@playwright/test";
import { createPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { canvas, openEditor, openLayers, overlay, saveDraft, unique } from "./support/helpers.ts";

const layoutFor = (first: string, second: string) => ({
  schemaVersion: 5,
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

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

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

  await saveDraft(page);

  const stored = await storedLayout<{
    root: { children: Array<{ type: string; props?: { text?: string } }> };
  }>(request, id);
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

const nestedLayout = (outer: string, inner: string) => ({
  schemaVersion: 5,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
    children: [
      {
        id: "box00001",
        type: "container",
        props: {},
        style: { flexDirection: "column", gap: { value: 8, unit: "px" } },
        children: [{ id: "head0001", type: "heading", props: { text: inner, level: 2 } }],
      },
      { id: "head0002", type: "heading", props: { text: outer, level: 1 } },
    ],
  },
});

test("moving a heading into another container saves the new tree", async ({ page, request }) => {
  const id = await createPage(
    request,
    "Move check",
    nestedLayout("Outside", "Inside"),
    `move-${unique()}`,
  );
  await openEditor(page, id, "Inside");
  await canvas(page).getByRole("heading", { name: "Outside" }).click();
  await expect(overlay(page).locator(".emvb-overlay-label")).toContainText("Heading");
  const handle = overlay(page).getByRole("button", { name: "Move element" });
  await expect(handle).toBeVisible();
  const target = canvas(page).getByRole("heading", { name: "Inside" });
  const box = await target.boundingBox();
  if (!box) throw new Error("Inside heading has no box");
  const handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error("Move handle has no box");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 16 });
  await page.mouse.up();
  await saveDraft(page);
  const stored = await storedLayout<{
    root: {
      children: Array<{
        id: string;
        type: string;
        children?: Array<{ props?: { text?: string } }>;
      }>;
    };
  }>(request, id);
  const boxNode = stored.root.children.find((c) => c.id === "box00001");
  expect(boxNode?.children?.map((c) => c.props?.text)).toContain("Outside");
});

test("dropping a container into its own child shows the invalid outline and changes nothing", async ({
  page,
  request,
}) => {
  const id = await createPage(
    request,
    "Invalid drop",
    nestedLayout("Outside", "Inside"),
    `bad-${unique()}`,
  );
  await openEditor(page, id, "Inside");
  // Select the outer box via Layers
  await openLayers(page);
  await overlay(page).locator('[data-emvb-layer="box00001"]').click();
  await expect(overlay(page).locator(".emvb-overlay-label")).toContainText("Container");
  const handle = overlay(page).getByRole("button", { name: "Move element" });
  const inside = canvas(page).getByRole("heading", { name: "Inside" });
  const box = await inside.boundingBox();
  const handleBox = await handle.boundingBox();
  if (!box || !handleBox) throw new Error("missing box");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
  await expect(overlay(page).locator("[data-emvb-invalid-outline]")).toBeVisible({
    timeout: 5_000,
  });
  await expect(overlay(page).locator("[data-emvb-invalid-label]")).toContainText(
    "A container can't go inside itself",
  );
  await page.mouse.up();
  // dragend on the Move handle (parent doc) clears the invalid outline.
  await expect(overlay(page).locator("[data-emvb-invalid-outline]")).toHaveCount(0, {
    timeout: 5_000,
  });
  const after = await storedLayout<{
    root: { children: Array<{ id: string; children?: unknown[] }> };
  }>(request, id);
  expect(after.root.children.map((c) => c.id)).toEqual(["box00001", "head0002"]);
  const outer = after.root.children[0];
  expect(
    outer && "children" in outer && Array.isArray(outer.children) ? outer.children.length : -1,
  ).toBe(1);
});
