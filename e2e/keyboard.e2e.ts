import { expect, test } from "@playwright/test";
import { createPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { canvas, openEditor, overlay, saveDraft, unique } from "./support/helpers.ts";

const layoutFor = () => ({
  schemaVersion: 11,
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

setUpEmvbOnce();

test("keyboard move, duplicate and delete round-trip on save", async ({ page, request }) => {
  const id = await createPage(request, "Keys", layoutFor(), `keys-${unique()}`);
  await openEditor(page, id);
  await canvas(page).getByRole("heading", { name: "First" }).click();
  await page.keyboard.press("Alt+ArrowDown");
  await page.keyboard.press("Control+d");
  await saveDraft(page);
  const stored = await storedLayout<{
    root: { children: Array<{ props?: { text?: string } }> };
  }>(request, id);
  expect(stored.root.children.map((c) => c.props?.text)).toEqual(["Second", "First", "First"]);
  // Delete the duplicate (last "First")
  await canvas(page).getByRole("heading", { name: "First" }).last().click();
  await page.keyboard.press("Delete");
  await saveDraft(page);
  const after = await storedLayout<{
    root: { children: Array<{ props?: { text?: string } }> };
  }>(request, id);
  expect(after.root.children.map((c) => c.props?.text)).toEqual(["Second", "First"]);
});

test("element keys on the settings panel's tabs and headers leave the selection alone (W-132)", async ({
  page,
  request,
}) => {
  const id = await createPage(request, "Panel keys", layoutFor(), `panel-keys-${unique()}`);
  await openEditor(page, id, "Second");
  const selected = overlay(page).locator("[data-emvb-selected]");
  await canvas(page).getByRole("heading", { name: "Second" }).click();
  await expect(selected).toHaveAttribute("data-emvb-selected", "head0002");

  const style = overlay(page).getByRole("tab", { name: "Style" });
  await style.click();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.press("Delete");
  await expect(selected).toHaveAttribute("data-emvb-selected", "head0002");
  await expect(canvas(page).getByRole("heading", { name: "Second" })).toBeVisible();

  const header = overlay(page).locator('[data-emvb-tab="style"] button[aria-expanded]').first();
  await header.focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Escape");
  await expect(selected).toHaveAttribute("data-emvb-selected", "head0002");
  await overlay(page).getByRole("tab", { name: "Content" }).click();
  await expect(selected).toHaveAttribute("data-emvb-selected", "head0002");

  // Undo still works from the panel: the panel tab keeps focus while the edit is undone.
  await overlay(page).getByLabel("Text", { exact: true }).fill("Second edited");
  await expect(canvas(page).getByRole("heading", { name: "Second edited" })).toBeVisible();
  await overlay(page).getByRole("tab", { name: "Content" }).focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(canvas(page).getByRole("heading", { name: "Second", exact: true })).toBeVisible();

  // From the canvas, ↑ still walks to the previous element.
  await canvas(page).getByRole("heading", { name: "Second", exact: true }).click();
  await page.keyboard.press("ArrowUp");
  await expect(selected).toHaveAttribute("data-emvb-selected", "head0001");
});
