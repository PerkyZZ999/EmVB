import { expect, test, type Locator } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { canvas, openEditor, openLayers, overlay, saveDraft, unique } from "./support/helpers.ts";

test.describe.configure({ mode: "serial" });

const tracks = (where: Locator) =>
  where.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);

setUpEmvbOnce();

test("a grid publishes equal columns and a column span", async ({ page, request }) => {
  const text = `Grid ${unique()}`;
  const slug = `grid-${unique()}`;
  const id = await createPage(
    request,
    text,
    {
      schemaVersion: 10,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "grid0001",
            type: "grid",
            props: { columns: 3 },
            children: [
              {
                id: "head0001",
                type: "heading",
                props: { text, level: 1 },
                style: { gridColumnSpan: 2 },
              },
            ],
          },
        ],
      },
    },
    slug,
  );
  await publishPage(request, id);
  await page.goto(`/${slug}`);
  await expect(page.getByRole("heading", { name: text })).toBeVisible();
  const sheet = (await page.locator("style").allTextContents()).join("\n");
  expect(sheet).toContain("display:grid");
  expect(sheet).toContain("grid-template-columns:repeat(3, minmax(0, 1fr))");
  expect(sheet).toContain("grid-column:span 2");
});

test("a grid takes its own column count on tablet and mobile, in the canvas and on the site (W-139)", async ({
  page,
  request,
  browser,
}) => {
  const text = `Grid devices ${unique()}`;
  const slug = `grid-devices-${unique()}`;
  const cell = (n: number) => ({
    id: `cell000${n}`,
    type: "heading",
    props: { text: n === 1 ? text : `Cell ${n}`, level: 2 },
  });
  const id = await createPage(
    request,
    text,
    {
      schemaVersion: 10,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "grid0001",
            type: "grid",
            props: { columns: 3 },
            children: [cell(1), cell(2), cell(3)],
          },
        ],
      },
    },
    slug,
  );
  await openEditor(page, id, text);
  await openLayers(page);
  await overlay(page).locator('[data-emvb-layer="grid0001"] .emvb-layer-select').click();
  const shown = canvas(page).locator('[data-emvb-id="grid0001"]');
  await expect.poll(() => tracks(shown)).toBe(3);
  const pick = async (label: string, option: string) => {
    await overlay(page).getByRole("combobox", { name: label }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
  };

  await page.getByRole("tab", { name: "Tablet" }).click();
  await expect(overlay(page).getByRole("combobox", { name: "Columns on tablet" })).toContainText(
    "Same as desktop (3)",
  );
  await pick("Columns on tablet", "2");
  await expect.poll(() => tracks(shown)).toBe(2);
  await page.getByRole("tab", { name: "Mobile" }).click();
  await expect(overlay(page).getByRole("combobox", { name: "Columns on mobile" })).toContainText(
    "Same as tablet (2)",
  );
  await pick("Columns on mobile", "1");
  await expect.poll(() => tracks(shown)).toBe(1);
  await page.getByRole("tab", { name: "Desktop" }).click();
  await expect.poll(() => tracks(shown)).toBe(3);
  await expect(overlay(page).locator('[data-emvb-device-values="columns"]')).toContainText(
    "Tablet 2 · Mobile 1",
  );

  await saveDraft(page);
  const stored = await storedLayout<{ root: { children: { props: object }[] } }>(request, id);
  expect(stored.root.children[0]?.props).toEqual({
    columns: 3,
    columnsTablet: 2,
    columnsMobile: 1,
  });

  await publishPage(request, id);
  for (const [width, count] of [
    [1280, 3],
    [900, 2],
    [400, 1],
  ] as const) {
    const visitor = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      const site = await visitor.newPage();
      await site.goto(`/${slug}`);
      const published = site.getByRole("heading", { name: text }).locator("..");
      await expect.poll(() => tracks(published)).toBe(count);
    } finally {
      await visitor.close();
    }
  }
});
