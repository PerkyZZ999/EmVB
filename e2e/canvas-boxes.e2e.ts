import { expect, test, type Page } from "@playwright/test";
import { createPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { canvas, openEditor, openLayers, overlay, unique } from "./support/helpers.ts";

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

const box = (id: string, style?: Record<string, unknown>) => ({
  id,
  type: "div-block",
  props: {},
  children: [],
  ...(style ? { style } : {}),
});

const page1 = (children: unknown[]) => ({
  schemaVersion: 10,
  root: { id: "root0001", type: "container", props: {}, children },
});

const height = (page: Page, id: string) =>
  canvas(page)
    .locator(`[data-emvb-id="${id}"]`)
    .evaluate((el) => el.getBoundingClientRect().height);

test("an empty box keeps the min-height its user set (W-145)", async ({ page, request }) => {
  const id = await createPage(
    request,
    "Box heights",
    page1([
      { id: "head0001", type: "heading", props: { text: "Box heights", level: 1 } },
      box("tall0001", { minHeight: { value: 421, unit: "px" } }),
      box("low00001", { minHeight: { value: 20, unit: "px" } }),
      box("none0001"),
    ]),
    `box-heights-${unique()}`,
  );
  await openEditor(page, id, "Box heights");
  await expect.poll(() => height(page, "tall0001")).toBe(421);
  await expect.poll(() => height(page, "low00001")).toBe(20);
  await expect.poll(() => height(page, "none0001")).toBe(48);
});

test("a Div Block added from the Add panel is visible and selectable while empty (W-146)", async ({
  page,
  request,
}) => {
  const id = await createPage(
    request,
    "Fresh box",
    page1([
      { id: "head0001", type: "heading", props: { text: "Fresh box", level: 1 } },
      {
        id: "flex0001",
        type: "flexbox",
        props: {},
        children: [],
        style: { flexDirection: "row" },
      },
    ]),
    `fresh-box-${unique()}`,
  );
  await openEditor(page, id, "Fresh box");
  await openLayers(page);
  for (const parent of ["root0001", "flex0001"]) {
    await overlay(page).locator(`[data-emvb-layer="${parent}"] .emvb-layer-select`).click();
    await overlay(page).getByRole("tab", { name: "Add" }).click();
    await overlay(page).locator('[data-emvb-add-tile="div-block"]').click();
    const added = canvas(page).locator(`[data-emvb-id="${parent}"] > .emvb-div-block:empty`);
    await expect(added).toHaveCount(1);
    const rect = await added.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height, x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    expect(rect.height).toBeGreaterThanOrEqual(48);
    expect(rect.width).toBeGreaterThanOrEqual(48);
    // Select the parent, then click the empty box on the canvas: it becomes the selection.
    await overlay(page).getByRole("tab", { name: "Layers" }).click();
    await overlay(page).locator(`[data-emvb-layer="${parent}"] .emvb-layer-select`).click();
    await added.click();
    await expect(overlay(page).locator(".emvb-overlay-label")).toContainText("Div Block");
  }
});

test("a palette tile dragged onto an empty page drops there (item C)", async ({
  page,
  request,
}) => {
  const id = await createPage(request, "Empty drop", page1([]), `empty-drop-${unique()}`);
  await openEditor(page, id);
  await overlay(page).getByRole("tab", { name: "Add" }).click();
  const tile = overlay(page).locator('[data-emvb-add-tile="div-block"]');
  const from = await tile.boundingBox();
  const root = canvas(page).locator('[data-emvb-id="root0001"]');
  const to = await root.boundingBox();
  if (!from || !to) throw new Error("no boxes");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + Math.min(to.height / 2, 24), { steps: 16 });
  await page.mouse.up();
  await expect(canvas(page).locator(".emvb-div-block")).toHaveCount(1, { timeout: 10_000 });
  await page.keyboard.press("Control+s");
  await expect
    .poll(async () =>
      (
        await storedLayout<{ root: { children: { type: string }[] } }>(request, id)
      ).root.children.map((c) => c.type),
    )
    .toEqual(["div-block"]);
});
