import { readFileSync } from "node:fs";
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { publishPage, storedLayout, setUpEmvbOnce } from "./support/api.ts";
import { canvas, overlay, settleAdminColorScheme, unique } from "./support/helpers.ts";

/**
 * W-1074 acceptance: WordPress block markup or an HTML page goes into Import HTML, its report is
 * shown, and the draft page (or theme part) opens in the editor and renders on the public site,
 * with nothing from hostile markup able to run.
 */

setUpEmvbOnce();

const fixture = (name: string) =>
  readFileSync(new URL(`../packages/emvb/test/fixtures/html/${name}.txt`, import.meta.url), "utf8");

const editorEntry = (url: string) => new URL(url).searchParams.get("entry") ?? "";

test("W-1074: WordPress block markup becomes a page that edits and publishes", async ({
  page,
  request,
}) => {
  const title = `WordPress import ${unique()}`;
  await page.goto("/_emdash/admin/plugins/emvb/pages");
  await page.getByRole("button", { name: "Import HTML", exact: true }).click();
  const dialog = page.locator('[data-emvb-dialog="import-html"]');
  await expect(dialog).toBeVisible();
  await dialog.locator("[data-emvb-html-file]").setInputFiles({
    name: "gutenberg-post.html",
    mimeType: "text/html",
    buffer: Buffer.from(fixture("gutenberg-post.html")),
  });
  await expect(dialog.locator("[data-emvb-import-file]")).toHaveText("gutenberg-post.html");
  const report = dialog.locator("[data-emvb-import-report]");
  await expect(report).toContainText(/Ready to import \d+ of \d+ WordPress blocks\./);
  await expect(report).toContainText("Latest Posts:");
  await expect(report).toContainText("Left out: scripts.");
  await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue(
    "Visit the Riverside bakery",
  );

  // The dialog with its report open: no serious or critical axe findings, light and dark.
  for (const colorScheme of ["light", "dark"] as const) {
    await settleAdminColorScheme(page, colorScheme);
    const axe = await new AxeBuilder({ page })
      .include('[data-emvb-dialog="import-html"]')
      .analyze();
    expect(
      axe.violations
        .filter((v) => ["serious", "critical"].includes(v.impact ?? ""))
        .map((v) => v.id),
    ).toEqual([]);
    await dialog.screenshot({ path: test.info().outputPath(`html-import-${colorScheme}.png`) });
  }
  await page.emulateMedia({ colorScheme: null });

  await dialog.getByLabel("Title", { exact: true }).fill(title);
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(overlay(page)).toBeVisible({ timeout: 20_000 });
  await expect(
    canvas(page).getByRole("heading", { name: "Visit the Riverside bakery", level: 1 }),
  ).toBeVisible();

  const id = editorEntry(page.url());
  const layout = JSON.stringify(await storedLayout(request, id));
  expect(layout).toContain('"type":"gallery"');
  expect(layout).not.toMatch(/<script|javascript:/i);

  await publishPage(request, id);
  const slug = title.toLowerCase().replaceAll(" ", "-");
  const response = await page.goto(`/${slug}`);
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Visit the Riverside bakery", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Order online" })).toHaveAttribute("href", "/order");
});

test("W-1074: a plain HTML page becomes a theme part", async ({ page }) => {
  await page.goto("/_emdash/admin/plugins/emvb/theme");
  await page.getByRole("button", { name: "Import HTML", exact: true }).click();
  const dialog = page.locator('[data-emvb-dialog="import-html"]');
  await dialog.locator("#emvb-import-html").fill(fixture("plain-page.html"));
  const report = dialog.locator("[data-emvb-import-report]");
  await expect(report).toContainText(/Ready to import \d+ of \d+ HTML elements as a section\./);
  await expect(report).toContainText("Only the page's main content was imported.");
  await dialog.getByLabel("Title", { exact: true }).fill(`Harbour part ${unique()}`);
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(overlay(page)).toBeVisible({ timeout: 20_000 });
  expect(page.url()).toContain("collection=emvb_theme_parts");
  await expect(canvas(page).getByRole("heading", { name: "Walk the old harbour" })).toBeVisible();
});

test("W-1074: hostile HTML publishes as an inert page", async ({ page, request }) => {
  const title = `Hostile import ${unique()}`;
  const dialogs: string[] = [];
  page.on("dialog", async (d) => {
    dialogs.push(d.message());
    await d.dismiss();
  });
  await page.goto("/_emdash/admin/plugins/emvb/pages");
  await page.getByRole("button", { name: "Import HTML", exact: true }).click();
  const dialog = page.locator('[data-emvb-dialog="import-html"]');
  await dialog
    .locator("#emvb-import-html")
    .fill(
      [
        "<h1>Safe heading</h1>",
        "<script>alert('script')</script>",
        `<p onclick="alert('click')">Click <a href="javascript:alert('link')">me</a> &lt;img src=x onerror=alert(1)&gt;</p>`,
        `<img src="x.png" onerror="alert('img')" alt="pic">`,
        `<iframe srcdoc="<script>alert('frame')</script>"></iframe>`,
        `<svg onload="alert('svg')"></svg>`,
      ].join("\n"),
    );
  const report = dialog.locator("[data-emvb-import-report]");
  await expect(report).toContainText(
    "Event handlers (onclick, onerror and the like) were left out.",
  );
  await expect(report).toContainText("Links with an unsafe or unsupported address");
  await dialog.getByLabel("Title", { exact: true }).fill(title);
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(overlay(page)).toBeVisible({ timeout: 20_000 });
  await expect(canvas(page).getByRole("heading", { name: "Safe heading" })).toBeVisible();

  const id = editorEntry(page.url());
  await publishPage(request, id);
  await page.goto(`/${title.toLowerCase().replaceAll(" ", "-")}`);
  await expect(page.getByRole("heading", { name: "Safe heading" })).toBeVisible();
  // The escaped markup is shown as text, and nothing from the input runs or links anywhere.
  await expect(page.getByText("<img src=x onerror=alert(1)>")).toBeVisible();
  const main = page.locator("main");
  expect(await main.locator("script:not([type='application/ld+json'])").count()).toBe(0);
  expect(await main.locator("iframe, svg[onload], [onerror], [onclick]").count()).toBe(0);
  expect(await main.locator("a[href^='javascript' i]").count()).toBe(0);
  expect(dialogs).toEqual([]);
});
