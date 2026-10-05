import { expect, test, type Page } from "@playwright/test";
import { createPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { canvas, openEditor, openLayers, overlay, saveDraft, unique } from "./support/helpers.ts";

const layoutFor = (first: string, second: string) => ({
  schemaVersion: 11,
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
  schemaVersion: 11,
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

type Tree = { id: string; type: string; props?: { text?: string }; children?: Tree[] };

const nestingLayout = {
  schemaVersion: 11,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
    children: [
      { id: "head0001", type: "heading", props: { text: "Nest top", level: 1 } },
      {
        id: "outr0001",
        type: "container",
        props: {},
        style: {
          paddingTop: { value: 24, unit: "px" },
          paddingBottom: { value: 24, unit: "px" },
          gap: { value: 12, unit: "px" },
        },
        children: [
          { id: "text0001", type: "text", props: { text: "Card copy" } },
          { id: "innr0001", type: "div-block", props: {}, children: [] },
        ],
      },
      {
        id: "grid0001",
        type: "grid",
        props: { columns: 2 },
        children: [{ id: "text0002", type: "text", props: { text: "Cell one" } }],
      },
    ],
  },
};

/** Drags an Add tile to a canvas point; `during` runs while the pointer is still down. */
async function dragTileTo(
  page: Page,
  tile: string,
  x: number,
  y: number,
  during?: () => Promise<void>,
) {
  const box = await overlay(page).locator(`[data-emvb-add-tile="${tile}"]`).boundingBox();
  if (!box) throw new Error(`${tile} tile has no box`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 16 });
  // A real pointer keeps sending dragover while it rests on the target.
  await page.mouse.move(x + 1, y);
  await page.mouse.move(x, y);
  await during?.();
  await page.mouse.up();
}

const childTypes = (tree: Tree, id: string): string[] => {
  const find = (node: Tree): Tree | undefined =>
    node.id === id ? node : node.children?.map(find).find(Boolean);
  return find(tree)?.children?.map((child) => child.type) ?? [];
};

test("dragging into an empty nested container nests it there and names the target (W-128)", async ({
  page,
  request,
}) => {
  const id = await createPage(request, "Nest drag", nestingLayout, `nest-${unique()}`);
  await openEditor(page, id, "Nest top");
  const inner = canvas(page).locator('[data-emvb-id="innr0001"]');
  const placeholder = await inner.evaluate((el) => ({
    text: getComputedStyle(el, "::after").content,
    height: el.getBoundingClientRect().height,
  }));
  expect(placeholder.text).toBe('"Drop elements here"');
  expect(placeholder.height).toBeGreaterThanOrEqual(48);
  const box = await inner.boundingBox();
  if (!box) throw new Error("inner div block has no box");
  await dragTileTo(page, "heading", box.x + box.width / 2, box.y + box.height / 2, async () => {
    await expect(overlay(page).locator("[data-emvb-drop-target-label]")).toHaveText(
      "Inside Div Block",
    );
    await expect(overlay(page).locator("[data-emvb-drop-target]")).toBeVisible();
    // W-129: the label sits inside the target's outline, not over the element above.
    const label = await overlay(page).locator("[data-emvb-drop-target-label]").boundingBox();
    const outline = await overlay(page).locator("[data-emvb-drop-target]").boundingBox();
    expect(label && outline ? Math.round(label.y - outline.y) : -1).toBeGreaterThanOrEqual(0);
  });
  await expect(overlay(page).locator("[data-emvb-drop-target]")).toHaveCount(0);
  await saveDraft(page);
  const stored = await storedLayout<{ root: Tree }>(request, id);
  expect(childTypes(stored.root, "innr0001")).toEqual(["heading"]);
  expect(childTypes(stored.root, "outr0001")).toEqual(["text", "div-block"]);
});

test("a drop over a Grid's empty cell goes into the Grid, not beside it (W-128)", async ({
  page,
  request,
}) => {
  const id = await createPage(request, "Grid drag", nestingLayout, `nest-grid-${unique()}`);
  await openEditor(page, id, "Nest top");
  const grid = await canvas(page).locator('[data-emvb-id="grid0001"]').boundingBox();
  if (!grid) throw new Error("grid has no box");
  // The empty second column: right half of the grid, vertically centred.
  await dragTileTo(page, "text", grid.x + grid.width * 0.75, grid.y + grid.height / 2);
  await saveDraft(page);
  const stored = await storedLayout<{ root: Tree }>(request, id);
  expect(childTypes(stored.root, "grid0001")).toEqual(["text", "text"]);
  expect(childTypes(stored.root, "root0001")).toEqual(["heading", "container", "grid"]);
});

test("near a container's bottom edge the drop goes after it, in its parent (W-128)", async ({
  page,
  request,
}) => {
  const id = await createPage(request, "Edge drag", nestingLayout, `nest-edge-${unique()}`);
  await openEditor(page, id, "Nest top");
  const outer = await canvas(page).locator('[data-emvb-id="outr0001"]').boundingBox();
  if (!outer) throw new Error("outer container has no box");
  await dragTileTo(
    page,
    "text",
    outer.x + outer.width / 2,
    outer.y + outer.height - 3,
    async () => {
      await expect(overlay(page).locator("[data-emvb-drop-target-label]")).toHaveText(
        "Inside Page",
      );
    },
  );
  await saveDraft(page);
  const stored = await storedLayout<{ root: Tree }>(request, id);
  expect(childTypes(stored.root, "root0001")).toEqual(["heading", "container", "text", "grid"]);
  expect(childTypes(stored.root, "outr0001")).toEqual(["text", "div-block"]);
});

test("a heading dropped on Tabs lands in the open tab panel (W-128)", async ({ page, request }) => {
  const layout = {
    schemaVersion: 11,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        { id: "head0001", type: "heading", props: { text: "Tabs top", level: 1 } },
        {
          id: "tabs0001",
          type: "tabs",
          props: {},
          children: [
            { id: "tabp0001", type: "tab-panel", props: { label: "First" }, children: [] },
            { id: "tabp0002", type: "tab-panel", props: { label: "Second" }, children: [] },
          ],
        },
      ],
    },
  };
  const id = await createPage(request, "Tabs drag", layout, `nest-tabs-${unique()}`);
  await openEditor(page, id, "Tabs top");
  const tabs = await canvas(page).locator('[data-emvb-id="tabs0001"]').boundingBox();
  if (!tabs) throw new Error("tabs have no box");
  // The tab strip itself belongs to Tabs, which only takes panels.
  await dragTileTo(page, "heading", tabs.x + tabs.width / 2, tabs.y + 6);
  await saveDraft(page);
  const stored = await storedLayout<{ root: Tree }>(request, id);
  expect(childTypes(stored.root, "tabp0001")).toEqual(["heading"]);
  expect(childTypes(stored.root, "tabs0001")).toEqual(["tab-panel", "tab-panel"]);
});

test("with a container selected, clicking an Add tile puts the element inside it (W-128)", async ({
  page,
  request,
}) => {
  const id = await createPage(request, "Click add", nestingLayout, `nest-click-${unique()}`);
  await openEditor(page, id, "Nest top");
  await openLayers(page);
  await overlay(page).locator('[data-emvb-layer="innr0001"] .emvb-layer-select').click();
  await overlay(page).getByRole("tab", { name: "Add" }).click();
  await overlay(page).locator('[data-emvb-add-tile="heading"]').click();
  await saveDraft(page);
  const stored = await storedLayout<{ root: Tree }>(request, id);
  expect(childTypes(stored.root, "innr0001")).toEqual(["heading"]);
});
