import { readFileSync } from "node:fs";
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { publishPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { canvas, overlay, unique } from "./support/helpers.ts";

/**
 * W-945 acceptance: an Elementor export is chosen in Import from Elementor, its report shown,
 * and the draft page (or theme part) opens in the editor and renders on the public site.
 */

setUpEmvbOnce();

const containerPage = JSON.parse(
  readFileSync(
    new URL("../packages/emvb/test/fixtures/elementor/container-page.json", import.meta.url),
    "utf8",
  ),
) as Record<string, unknown>;

const editorEntry = (url: string) => new URL(url).searchParams.get("entry") ?? "";

test("W-945: an Elementor template becomes a page that edits and publishes", async ({
  page,
  request,
}) => {
  const title = `Elementor import ${unique()}`;
  await page.goto("/_emdash/admin/plugins/emvb/pages");
  await page.getByRole("button", { name: "Import from Elementor", exact: true }).click();
  const dialog = page.locator('[data-emvb-dialog="import-elementor"]');
  await expect(dialog).toBeVisible();
  await dialog.locator("[data-emvb-elementor-file]").setInputFiles({
    name: "container-page.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...containerPage, title })),
  });
  const report = dialog.locator("[data-emvb-import-report]");
  await expect(report).toContainText("Ready to import 24 of 24 Elementor elements.");
  await expect(report).toContainText("Images still load from their original address");
  await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue(title);

  // The dialog with its report open: no serious or critical axe findings, light and dark.
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const axe = await new AxeBuilder({ page })
      .include('[data-emvb-dialog="import-elementor"]')
      .analyze();
    expect(
      axe.violations
        .filter((v) => ["serious", "critical"].includes(v.impact ?? ""))
        .map((v) => v.id),
    ).toEqual([]);
    await dialog.screenshot({ path: test.info().outputPath(`import-dialog-${colorScheme}.png`) });
  }
  await page.emulateMedia({ colorScheme: null });

  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(overlay(page)).toBeVisible({ timeout: 20_000 });
  await expect(
    canvas(page).getByRole("heading", { name: "Build pages visually", level: 1 }),
  ).toBeVisible();
  await expect(canvas(page).getByRole("tab", { name: "Publish" })).toBeVisible();

  const id = editorEntry(page.url());
  const layout = JSON.stringify(await storedLayout(request, id));
  expect(layout).toContain('"iconId":"fa-solid:arrow-right"');
  expect(layout).toContain("<svg");

  await publishPage(request, id);
  const slug = title.toLowerCase().replaceAll(" ", "-");
  const response = await page.goto(`/${slug}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Build pages visually", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Get started" })).toHaveAttribute(
    "href",
    "https://example.com/start",
  );
  // Imported pages stay script-free apart from the runtimes they ask for (tabs here).
  const scripts = await page.locator("main script:not([type='application/ld+json'])").count();
  expect(scripts).toBeLessThanOrEqual(1);
});

test("W-945: a header template from Elementor becomes a header theme part", async ({ page }) => {
  const title = `Imported header ${unique()}`;
  await page.goto("/_emdash/admin/plugins/emvb/theme");
  await page.getByRole("button", { name: "Import from Elementor", exact: true }).click();
  const dialog = page.locator('[data-emvb-dialog="import-elementor"]');
  await dialog.locator("#emvb-elementor-json").fill(
    JSON.stringify({
      version: "0.4",
      title,
      type: "header",
      content: [
        {
          id: "hd",
          elType: "container",
          settings: { flex_direction: "row", flex_justify_content: "space-between" },
          elements: [
            {
              id: "t",
              elType: "widget",
              widgetType: "heading",
              settings: { title: "Brand", header_size: "p" },
            },
            { id: "n", elType: "widget", widgetType: "nav-menu", settings: { menu: "main" } },
          ],
        },
      ],
    }),
  );
  await expect(dialog.locator("[data-emvb-import-report]")).toContainText("as a header.");
  await expect(dialog.locator("[data-emvb-import-report]")).toContainText(
    'The WordPress menu "main" isn\'t on this site',
  );
  await expect(dialog.getByRole("combobox", { name: "Type" })).toContainText("Header");
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(overlay(page)).toBeVisible({ timeout: 20_000 });
  expect(page.url()).toContain("collection=emvb_theme_parts");
  await expect(canvas(page).getByText("Brand")).toBeVisible();
});

test("W-945: text that isn't an export is explained and nothing is created", async ({ page }) => {
  let creates = 0;
  await page.route("**/_emdash/api/content/emvb_pages", async (route) => {
    if (route.request().method() === "POST") creates += 1;
    await route.continue();
  });
  await page.goto("/_emdash/admin/plugins/emvb/pages");
  await page.getByRole("button", { name: "Import from Elementor", exact: true }).click();
  const dialog = page.locator('[data-emvb-dialog="import-elementor"]');
  await dialog.locator("#emvb-elementor-json").fill("<?xml version='1.0'?><rss></rss>");
  await expect(dialog.locator("[data-emvb-import-error]")).toContainText("WordPress XML export");
  await dialog.getByLabel("Title", { exact: true }).fill(`Nothing ${unique()}`);
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(
    dialog.getByRole("alert").filter({ hasText: "Couldn't create the page." }),
  ).toBeVisible();
  expect(creates).toBe(0);
});

test("W-945: an Elementor 4 page keeps its class styles in the editor", async ({ page }) => {
  const atomic = JSON.parse(
    readFileSync(
      new URL("../packages/emvb/test/fixtures/elementor/atomic-page.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, unknown>;
  const title = `Atomic import ${unique()}`;
  await page.goto("/_emdash/admin/plugins/emvb/pages");
  await page.getByRole("button", { name: "Import from Elementor", exact: true }).click();
  const dialog = page.locator('[data-emvb-dialog="import-elementor"]');
  await dialog.locator("#emvb-elementor-json").fill(JSON.stringify({ ...atomic, title }));
  await expect(dialog.locator("[data-emvb-import-report]")).toContainText("Ready to import");
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(overlay(page)).toBeVisible({ timeout: 20_000 });
  const heading = canvas(page).getByRole("heading", { name: "Fast pages, no code.", level: 1 });
  await expect(heading).toBeVisible();
  // The global class's fluid font size (32 to 56 px, W-955) and weight reach the canvas.
  const size = await heading.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(32);
  expect(size).toBeLessThanOrEqual(56);
  await expect(heading).toHaveCSS("font-weight", "800");
});

test("W-1026: a sticky header's Nav Menu imports with the site's Primary menu links", async ({
  page,
  request,
}) => {
  const title = `Sticky menu ${unique()}`;
  await page.goto("/_emdash/admin/plugins/emvb/pages");
  await page.getByRole("button", { name: "Import from Elementor", exact: true }).click();
  const dialog = page.locator('[data-emvb-dialog="import-elementor"]');
  await dialog.locator("[data-emvb-elementor-file]").setInputFiles({
    name: "sticky-menu.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        title,
        type: "page",
        content: [
          {
            id: "bar",
            elType: "container",
            settings: { sticky: "top", sticky_offset: 0 },
            elements: [
              {
                id: "nav",
                elType: "widget",
                widgetType: "nav-menu",
                settings: { menu: "primary" },
              },
            ],
          },
        ],
      }),
    ),
  });
  const report = dialog.locator("[data-emvb-import-report]");
  await expect(report).toContainText("Ready to import");
  await expect(report).not.toContainText("isn't on this site");
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(overlay(page)).toBeVisible({ timeout: 20_000 });
  const menu = canvas(page).locator(".emvb-menu");
  for (const name of ["Home", "Posts", "About"])
    await expect(menu.getByRole("link", { name, exact: true })).toBeVisible();
  const stored = await storedLayout<{
    root: { children: { style?: Record<string, unknown> }[] };
  }>(request, editorEntry(page.url()));
  expect(stored.root.children[0]?.style).toMatchObject({ position: "sticky", zIndex: 99 });
});
