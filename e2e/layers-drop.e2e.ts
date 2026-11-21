import { expect, test, type Locator, type Page } from "@playwright/test";
import { createPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { canvas, openEditor, openLayers, overlay, saveDraft, unique } from "./support/helpers.ts";

// W-1080: drop into the Layers list, from the Add panel and from Layers itself.

const layoutFor = () => ({
  schemaVersion: 17,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
    children: [
      { id: "head0001", type: "heading", props: { text: "Alpha", level: 1 } },
      { id: "head0002", type: "heading", props: { text: "Beta", level: 2 } },
      {
        id: "box00001",
        type: "container",
        props: {},
        style: { flexDirection: "column", gap: { value: 8, unit: "px" } },
        children: [{ id: "head0003", type: "heading", props: { text: "Inside", level: 2 } }],
      },
    ],
  },
});

type Stored = {
  root: {
    children: Array<{
      id: string;
      type: string;
      props?: { text?: string };
      children?: Array<{ id: string }>;
    }>;
  };
};

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

const row = (page: Page, id: string) => overlay(page).locator(`[data-emvb-layer="${id}"]`);

async function centre(locator: Locator, part = 0.5) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("no box");
  return { x: box.x + box.width / 2, y: box.y + box.height * part };
}

/** Presses on `from`, then moves to `to` with real mouse steps so Chromium runs HTML5 DnD. */
async function startDrag(page: Page, from: Locator) {
  const start = await centre(from);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 8, start.y + 8, { steps: 4 });
}

const visibleRows = (page: Page) =>
  overlay(page)
    .locator("[data-emvb-layer]")
    .evaluateAll((rows) => rows.map((r) => r.getAttribute("data-emvb-layer")));

test("an Add tile dragged over the Layers tab drops between two rows, in one undo step", async ({
  page,
  request,
}) => {
  const id = await createPage(request, "Layers drop add", layoutFor(), `ldrop-${unique()}`);
  await openEditor(page, id, "Alpha");
  await overlay(page).getByRole("tab", { name: "Add" }).click();
  // Filter so the tile sits under the tabs: the Add panel is taller than the window.
  await overlay(page).getByRole("searchbox", { name: "Search elements" }).fill("Heading");
  await startDrag(page, overlay(page).locator('[data-emvb-add-tile="heading"]'));
  // Hovering the Layers tab opens Layers mid-drag.
  const tab = await centre(overlay(page).getByRole("tab", { name: "Layers" }));
  await page.mouse.move(tab.x, tab.y, { steps: 8 });
  await expect(overlay(page).locator('[data-emvb-panel="layers"]')).toBeVisible();
  // The bottom of Alpha's row: after Alpha, before Beta, at Alpha's depth.
  const target = await centre(row(page, "head0001"), 0.85);
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await expect(overlay(page).locator("[data-emvb-layer-drop-line]")).toBeVisible();
  await page.mouse.up();

  await expect(canvas(page).getByRole("heading", { name: "Heading" })).toBeVisible();
  await expect(overlay(page).locator(".emvb-layer-select[aria-current='true']")).toContainText(
    "Heading",
  );
  await expect(overlay(page).locator(".emvb-sr-only[aria-live='polite']")).toHaveText(
    "Heading added inside Page",
  );
  await saveDraft(page);
  const stored = await storedLayout<Stored>(request, id);
  expect(stored.root.children.map((child) => child.props?.text ?? child.type)).toEqual([
    "Alpha",
    "Heading",
    "Beta",
    "container",
  ]);

  await overlay(page).getByRole("button", { name: "Undo", exact: true }).click();
  await expect(canvas(page).getByRole("heading", { name: "Heading" })).toHaveCount(0);
  expect(await visibleRows(page)).toEqual([
    "root0001",
    "head0001",
    "head0002",
    "box00001",
    "head0003",
  ]);
});

test("a Layers row dragged onto a container row goes inside it", async ({ page, request }) => {
  const id = await createPage(request, "Layers drop move", layoutFor(), `lmove-${unique()}`);
  await openEditor(page, id, "Alpha");
  await openLayers(page);
  await startDrag(page, row(page, "head0002").locator(".emvb-layer-select"));
  const target = await centre(row(page, "box00001"), 0.5);
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await expect(row(page, "box00001")).toHaveAttribute("data-emvb-drop", "inside");
  await page.mouse.up();

  await expect(overlay(page).locator(".emvb-layer-select[aria-current='true']")).toContainText(
    "Beta",
  );
  expect(await visibleRows(page)).toEqual([
    "root0001",
    "head0001",
    "box00001",
    "head0003",
    "head0002",
  ]);
  await saveDraft(page);
  const stored = await storedLayout<Stored>(request, id);
  expect(stored.root.children.map((child) => child.id)).toEqual(["head0001", "box00001"]);
  const box = stored.root.children.find((child) => child.id === "box00001");
  expect(box?.children?.map((child) => child.id)).toEqual(["head0003", "head0002"]);
});

test("a container dragged onto its own child row is refused and nothing moves", async ({
  page,
  request,
}) => {
  const id = await createPage(request, "Layers drop bad", layoutFor(), `lbad-${unique()}`);
  await openEditor(page, id, "Alpha");
  await openLayers(page);
  const before = await visibleRows(page);
  await startDrag(page, row(page, "box00001").locator(".emvb-layer-select"));
  const target = await centre(row(page, "head0003"), 0.3);
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await expect(row(page, "head0003")).toHaveAttribute("data-emvb-drop", "invalid");
  await expect(overlay(page).locator("[data-emvb-layer-drop-refusal]")).toHaveText(
    "A container can't go inside itself.",
  );
  await expect(overlay(page).locator("[data-emvb-layer-drop-line]")).toHaveCount(0);
  await page.mouse.up();

  await expect(overlay(page).locator("[data-emvb-layer-drop-refusal]")).toHaveCount(0);
  expect(await visibleRows(page)).toEqual(before);
  await expect(overlay(page).getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
});
