import { expect, test } from "@playwright/test";
import { createPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { canvas, openEditor, overlay, saveDraft, unique } from "./support/helpers.ts";

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

const layoutFor = (text: string) => ({
  schemaVersion: 8,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
    children: [{ id: "head0001", type: "heading", props: { text, level: 1 } }],
  },
});

test("double-clicking a heading edits its text on the canvas", async ({ page, request }) => {
  const text = `Canvas ${unique()}`;
  const next = `Edited ${unique()}`;
  const id = await createPage(request, text, layoutFor(text));
  await openEditor(page, id, text);
  await canvas(page).getByRole("heading", { name: text }).dblclick();
  const field = overlay(page).getByRole("textbox", { name: "Edit text" });
  await expect(field).toBeVisible();
  await field.fill(next);
  await field.press("Enter");
  await expect(field).toBeHidden();
  await saveDraft(page);
  const stored = await storedLayout<{
    root: { children?: { props?: { text?: string } }[] };
  }>(request, id);
  expect(stored.root.children?.[0]?.props?.text).toBe(next);
});
