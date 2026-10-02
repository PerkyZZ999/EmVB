import { expect, test, type Page } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { canvas, openEditor, overlay, saveDraft, unique } from "./support/helpers.ts";

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

const layoutFor = (text: string) => ({
  schemaVersion: 8,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "column" },
    children: [
      {
        id: "card0001",
        type: "container",
        props: {},
        style: { paddingTop: { value: 24, unit: "px" }, paddingLeft: { value: 24, unit: "px" } },
        children: [{ id: "head0001", type: "heading", props: { text, level: 2 } }],
      },
    ],
  },
});

async function openPage(page: Page, request: Parameters<typeof createPage>[0]) {
  const text = `Background ${unique()}`;
  const slug = `background-${unique()}`;
  const id = await createPage(request, text, layoutFor(text), slug);
  await openEditor(page, id, text);
  return { id, slug };
}

test("Background section sets an image, a gradient and an overlay on the stored page and the published CSS", async ({
  page,
  request,
}) => {
  const { id, slug } = await openPage(page, request);
  await canvas(page)
    .locator('[data-emvb-id="card0001"]')
    .click({ position: { x: 4, y: 4 } });
  const tab = overlay(page).getByRole("tab", { name: "Style" });
  if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
  const header = overlay(page).locator('[data-emvb-section="background"]');
  if ((await header.getAttribute("aria-expanded")) !== "true") await header.click();

  const url = overlay(page).getByLabel("Image URL", { exact: true });
  await url.fill("https://cdn.example/photo.png");
  await url.press("Enter");
  await overlay(page).getByRole("combobox", { name: "Image size", exact: true }).click();
  await page.getByRole("option", { name: "Contain", exact: true }).click();
  await overlay(page).getByRole("button", { name: "Add gradient" }).click();
  await overlay(page).getByRole("button", { name: "Add overlay" }).click();

  await saveDraft(page);
  const stored = await storedLayout<{ root: { children?: { style?: Record<string, unknown> }[] } }>(
    request,
    id,
  );
  expect(stored.root.children?.[0]?.style).toMatchObject({
    backgroundImage: "https://cdn.example/photo.png",
    backgroundSize: "contain",
    gradient: { angle: 180, from: "#ffffff", to: "#000000" },
    overlay: { color: "#000000", opacity: 0.4 },
  });

  await publishPage(request, id);
  await page.goto(`/${slug}`);
  const css = await page.locator("style").allTextContents();
  const sheet = css.join("\n");
  expect(sheet).toContain('url("https://cdn.example/photo.png")');
  expect(sheet).toContain("linear-gradient(#00000066, #00000066)");
  expect(sheet).toContain("linear-gradient(180deg, #ffffff, #000000)");
  expect(sheet).toContain("auto,contain,auto");
});
