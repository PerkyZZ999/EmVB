import { expect, test } from "@playwright/test";
import { createPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { canvas, openEditor, saveDraft, unique } from "./support/helpers.ts";

const layoutFor = () => ({
  schemaVersion: 5,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
    children: [
      { id: "head0001", type: "heading", props: { text: "Keep me", level: 1 } },
      { id: "head0002", type: "heading", props: { text: "Other", level: 2 } },
    ],
  },
});

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

test("Ctrl+Z restores a deleted element and Ctrl+Y removes it again", async ({ page, request }) => {
  const id = await createPage(request, "Undo", layoutFor(), `undo-${unique()}`);
  await openEditor(page, id);
  await canvas(page).getByRole("heading", { name: "Keep me" }).click();
  await page.keyboard.press("Delete");
  await expect(canvas(page).getByRole("heading", { name: "Keep me" })).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(canvas(page).getByRole("heading", { name: "Keep me" })).toBeVisible();
  await saveDraft(page);
  const restored = await storedLayout<{
    root: { children: Array<{ id: string }> };
  }>(request, id);
  expect(restored.root.children.map((child) => child.id)).toEqual(["head0001", "head0002"]);

  await page.keyboard.press("ControlOrMeta+y");
  await expect(canvas(page).getByRole("heading", { name: "Keep me" })).toHaveCount(0);
  await saveDraft(page);
  const redone = await storedLayout<{
    root: { children: Array<{ id: string }> };
  }>(request, id);
  expect(redone.root.children.map((child) => child.id)).toEqual(["head0002"]);
});
