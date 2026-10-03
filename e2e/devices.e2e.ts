import { expect, test } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { canvas, openEditor, saveDraft, unique } from "./support/helpers.ts";

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

const layoutFor = (text: string) => ({
  schemaVersion: 9,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
    children: [{ id: "head0001", type: "heading", props: { text, level: 1 } }],
  },
});

test("Hide on mobile is stored and the published CSS hides that element", async ({
  page,
  request,
}) => {
  const text = `Device ${unique()}`;
  const slug = `device-${unique()}`;
  const id = await createPage(request, text, layoutFor(text), slug);
  await openEditor(page, id, text);
  await canvas(page).getByRole("heading", { name: text }).click();
  await page.getByRole("tab", { name: "Mobile" }).click();
  await expect(page.locator("[data-emvb-device]")).toHaveAttribute("data-emvb-device", "mobile");
  await page.getByRole("checkbox", { name: "Hide on mobile" }).check();
  await saveDraft(page);
  const stored = await storedLayout<{
    root: { children?: { id: string; hiddenOn?: string[] }[] };
  }>(request, id);
  expect(stored.root.children?.[0]?.hiddenOn).toEqual(["mobile"]);

  await publishPage(request, id);
  await page.goto(`/${slug}`);
  const sheet = (await page.locator("style").allTextContents()).join("\n");
  expect(sheet).toContain("@media (max-width: 767px){.emvb-e-head0001{display:none}}");
});
