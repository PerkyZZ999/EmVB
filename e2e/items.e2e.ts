import { expect, test, type Page } from "@playwright/test";
import { createPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { canvas, openEditor, openLayers, overlay, saveDraft, unique } from "./support/helpers.ts";

type Tree = { id: string; type: string; props: Record<string, unknown>; children?: Tree[] };

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

const find = (node: Tree, id: string): Tree | undefined =>
  node.id === id ? node : (node.children ?? []).map((c) => find(c, id)).find(Boolean);

const page1 = (children: unknown[]) => ({
  schemaVersion: 10,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "head0001", type: "heading", props: { text: "Items top", level: 1 } },
      ...children,
    ],
  },
});

const contentPanel = (page: Page) => overlay(page).locator('[data-emvb-tab="content"]');
const titles = (page: Page) =>
  contentPanel(page)
    .locator("[data-emvb-item] input")
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
const summaries = (page: Page) => canvas(page).locator("summary").allTextContents();

/** The `::after` text the editor canvas shows on an element, or "" when it shows none. */
const hint = (page: Page, selector: string) =>
  canvas(page)
    .locator(selector)
    .evaluate((el) => {
      const content = getComputedStyle(el, "::after").content;
      return content === "none" || content === "normal" ? "" : content;
    });

/** The toast slides in; click Restore once it has settled under the pointer. */
async function clickRestore(page: Page) {
  const restore = page.getByRole("button", { name: "Restore" });
  await expect(restore).toBeVisible();
  const centreOf = async () => {
    const box = await restore.boundingBox();
    return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : { x: -1, y: -1 };
  };
  const hitAt = (point: { x: number; y: number }) =>
    page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.textContent ?? null,
      point,
    );
  await expect.poll(async () => hitAt(await centreOf())).toBe("Restore");
  const centre = await centreOf();
  await page.mouse.click(centre.x, centre.y);
}

test("a new Accordion has three items and its Content tab edits them (W-130)", async ({
  page,
  request,
}) => {
  const id = await createPage(request, "Accordion items", page1([]), `items-${unique()}`);
  await openEditor(page, id, "Items top");
  await canvas(page).getByRole("heading", { name: "Items top" }).click();
  await overlay(page).getByRole("tab", { name: "Add" }).click();
  await overlay(page).locator('[data-emvb-add-tile="accordion"]').click();

  await expect(overlay(page).locator('[data-emvb-element="accordion"]')).toBeVisible();
  await expect(contentPanel(page)).not.toContainText("no content settings");
  expect(await titles(page)).toEqual(["Item 1", "Item 2", "Item 3"]);
  expect(await summaries(page)).toEqual(["Item 1", "Item 2", "Item 3"]);
  await expect(canvas(page).getByText("Content for item 1.", { exact: false })).toBeVisible();
  await expect(canvas(page).getByText("Content for item 2.", { exact: false })).toBeHidden();

  await contentPanel(page).getByLabel("Item 2 title").fill("Pricing");
  await expect(canvas(page).locator("summary").nth(1)).toHaveText("Pricing");

  await contentPanel(page).getByRole("button", { name: "Add item" }).click();
  await expect(overlay(page).locator('[data-emvb-element="accordion"]')).toBeVisible();
  expect(await titles(page)).toEqual(["Item 1", "Pricing", "Item 3", "Item 4"]);

  await contentPanel(page).getByRole("button", { name: "Move item 4 up" }).click();
  expect(await titles(page)).toEqual(["Item 1", "Pricing", "Item 4", "Item 3"]);
  expect(await summaries(page)).toEqual(["Item 1", "Pricing", "Item 4", "Item 3"]);

  await contentPanel(page).getByRole("button", { name: "Delete item 1" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  expect(await titles(page)).toEqual(["Pricing", "Item 4", "Item 3"]);
  await clickRestore(page);
  await expect(canvas(page).locator("summary")).toHaveCount(4);
  // Restore selects what came back, as for any delete; the breadcrumb leads back to the list.
  await expect(contentPanel(page).getByLabel("Title")).toHaveValue("Item 1");
  await overlay(page)
    .getByRole("navigation", { name: "Element path" })
    .getByRole("button", { name: "Accordion", exact: true })
    .click();
  expect(await titles(page)).toEqual(["Item 1", "Pricing", "Item 4", "Item 3"]);

  await contentPanel(page).getByRole("button", { name: "Edit item 2" }).click();
  await expect(overlay(page).locator('[data-emvb-element="accordion-item"]')).toBeVisible();
  await expect(contentPanel(page).getByLabel("Title")).toHaveValue("Pricing");
  await expect(contentPanel(page)).toContainText("elements in its body");

  await saveDraft(page);
  const stored = await storedLayout<{ root: Tree }>(request, id);
  const accordion = stored.root.children?.find((c) => c.type === "accordion");
  expect(accordion?.children?.map((c) => c.props.summary)).toEqual([
    "Item 1",
    "Pricing",
    "Item 4",
    "Item 3",
  ]);
  expect(accordion?.children?.map((c) => c.children?.map((k) => k.type))).toEqual([
    ["text"],
    ["text"],
    ["text"],
    ["text"],
  ]);
});

test("a saved empty Accordion keeps working and points at its item list (W-130)", async ({
  page,
  request,
}) => {
  const layout = page1([
    { id: "acc00001", type: "accordion", props: {}, children: [] },
    {
      id: "tabs0001",
      type: "tabs",
      props: {},
      children: [
        { id: "tabp0001", type: "tab-panel", props: { label: "First" }, children: [] },
        { id: "tabp0002", type: "tab-panel", props: { label: "Second" }, children: [] },
      ],
    },
    { id: "tabs0002", type: "tabs", props: {}, children: [] },
  ]);
  const id = await createPage(request, "Empty items", layout, `items-empty-${unique()}`);
  await openEditor(page, id, "Items top");

  expect(await hint(page, '[data-emvb-id="acc00001"]')).toContain("No items yet");
  expect(await hint(page, '[data-emvb-id="tabs0002"]')).toContain("No items yet");
  // An empty tab panel shows the drop hint, but a hidden one stays hidden.
  await expect(canvas(page).locator('[data-emvb-id="tabp0001"]')).toBeVisible();
  expect(await hint(page, '[data-emvb-id="tabp0001"]')).toContain("Drop elements here");
  await expect(canvas(page).locator('[data-emvb-id="tabp0002"]')).toBeHidden();

  await openLayers(page);
  await overlay(page).locator('[data-emvb-layer="acc00001"] .emvb-layer-select').click();
  await expect(contentPanel(page)).toContainText("No items yet");
  await contentPanel(page).getByRole("button", { name: "Add item" }).click();
  expect(await summaries(page)).toEqual(["Item 1"]);
  expect(await hint(page, '[data-emvb-id="acc00001"]')).toBe("");
  await saveDraft(page);
  const stored = await storedLayout<{ root: Tree }>(request, id);
  expect(find(stored.root, "acc00001")?.children?.map((c) => c.props.summary)).toEqual(["Item 1"]);
});

const question = (n: number, open?: boolean) => ({
  id: `itm0000${n}`,
  type: "accordion-item",
  props: open ? { summary: `Question ${n}`, open } : { summary: `Question ${n}` },
  children: [{ id: `txt0000${n}`, type: "text", props: { text: `Answer ${n}` } }],
});

test("selecting inside a closed accordion item opens it on the canvas only (W-130)", async ({
  page,
  request,
}) => {
  const layout = page1([
    { id: "acc00001", type: "accordion", props: {}, children: [question(1, true), question(2)] },
  ]);
  const id = await createPage(request, "Reveal item", layout, `items-reveal-${unique()}`);
  await openEditor(page, id, "Items top");
  const second = canvas(page).locator('[data-emvb-id="itm00002"]');
  await expect(canvas(page).getByText("Answer 2")).toBeHidden();

  await openLayers(page);
  await overlay(page).locator('[data-emvb-layer="txt00002"] .emvb-layer-select').click();
  await expect(canvas(page).getByText("Answer 2")).toBeVisible();
  await expect(second).toHaveAttribute("open", "");

  await canvas(page).getByRole("heading", { name: "Items top" }).click();
  await expect(canvas(page).getByText("Answer 2")).toBeHidden();
  await expect(canvas(page).getByText("Answer 1")).toBeVisible();

  await saveDraft(page);
  const stored = await storedLayout<{ root: Tree }>(request, id);
  expect(find(stored.root, "itm00002")?.props.open).toBeUndefined();
});
