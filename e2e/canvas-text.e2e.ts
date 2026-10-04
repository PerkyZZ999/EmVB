import { expect, test } from "@playwright/test";
import { createPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { canvas, openEditor, overlay, saveDraft, unique } from "./support/helpers.ts";

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

const layoutFor = (text: string) => ({
  schemaVersion: 10,
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

test("the text being edited stays visible in the heading's colour (W-117)", async ({
  page,
  request,
}) => {
  const text = `Visible ${unique()}`;
  const layout = layoutFor(text);
  const heading = layout.root.children[0] as { style?: object } | undefined;
  if (heading) heading.style = { color: "#123456" };
  const id = await createPage(request, text, layout);
  await openEditor(page, id, text);
  await canvas(page).getByRole("heading", { name: text }).dblclick();
  const field = overlay(page).getByRole("textbox", { name: "Edit text" });
  await expect(field).toBeVisible();
  const color = () => field.evaluate((el) => getComputedStyle(el).color);
  expect(await color()).toBe("rgb(18, 52, 86)");
  const canvasSelection = await canvas(page)
    .locator("body")
    .evaluate((body) => body.ownerDocument.getSelection()?.toString() ?? "");
  expect(canvasSelection).toBe("");
  await field.press("End");
  await field.pressSequentially(" now");
  await expect(field).toHaveValue(`${text} now`);
  expect(await color()).toBe("rgb(18, 52, 86)");
  await field.press("Escape");
});
