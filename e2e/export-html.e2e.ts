import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce } from "./support/api.ts";
import { unique } from "./support/helpers.ts";

/**
 * W-963 acceptance: Export as HTML on the Pages list downloads a zip of a published page that
 * opens on its own, with the tabs script it needs, and a report.
 */

setUpEmvbOnce();

/** The files of a stored (uncompressed) zip, as the export writes it. */
function unzip(bytes: Buffer): Map<string, Buffer> {
  const end = bytes.length - 22;
  const count = bytes.readUInt16LE(end + 10);
  let at = bytes.readUInt32LE(end + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i += 1) {
    const size = bytes.readUInt32LE(at + 20);
    const nameLength = bytes.readUInt16LE(at + 28);
    const local = bytes.readUInt32LE(at + 42);
    const name = bytes.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    const start = local + 30 + bytes.readUInt16LE(local + 26);
    out.set(name, bytes.subarray(start, start + size));
    at += 46 + nameLength;
  }
  return out;
}

test("W-963: a published page exports as HTML that works on its own", async ({ page, request }) => {
  const title = `Export ${unique()}`;
  const slug = title.toLowerCase().replaceAll(" ", "-");
  const id = await createPage(
    request,
    title,
    {
      schemaVersion: 18,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "head0001", type: "heading", props: { text: title, level: 1 } },
          {
            id: "tabs0001",
            type: "tabs",
            props: {},
            children: [
              {
                id: "tabp0001",
                type: "tab-panel",
                props: { label: "First" },
                children: [{ id: "text0001", type: "text", props: { text: "First panel" } }],
              },
              {
                id: "tabp0002",
                type: "tab-panel",
                props: { label: "Second" },
                children: [{ id: "text0002", type: "text", props: { text: "Second panel" } }],
              },
            ],
          },
        ],
      },
    },
    slug,
  );
  await publishPage(request, id);

  await page.goto("/_emdash/admin/plugins/emvb/pages");
  await page.getByRole("button", { name: "Export as HTML", exact: true }).click();
  const dialog = page.locator('[data-emvb-dialog="export-html"]');
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox", { name: "Pages" }).click();
  await page.getByRole("option", { name: title, exact: true }).click();

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const axe = await new AxeBuilder({ page })
      .include('[data-emvb-dialog="export-html"]')
      .analyze();
    expect(
      axe.violations
        .filter((v) => ["serious", "critical"].includes(v.impact ?? ""))
        .map((v) => v.id),
    ).toEqual([]);
    await dialog.screenshot({ path: test.info().outputPath(`export-dialog-${colorScheme}.png`) });
  }
  await page.emulateMedia({ colorScheme: null });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    new RegExp(`^emvb-export-${slug}-\\d{4}-\\d{2}-\\d{2}\\.zip$`),
  );
  await expect(dialog.locator("[data-emvb-export-status]")).toContainText("Downloaded 1 page.");

  const files = unzip(readFileSync(await download.path()));
  expect([...files.keys()].toSorted()).toEqual(
    [
      `${slug}/index.html`,
      `${slug}/style.css`,
      "assets/emvb-tabs.js",
      "assets/export-index.css",
      "index.html",
      "EXPORT-REPORT.md",
    ].toSorted(),
  );
  const html = files.get(`${slug}/index.html`)?.toString("utf8") ?? "";
  expect(html).toContain(`<title>${title}</title>`);
  expect(html).not.toContain("/_emdash/admin");

  // The exported folder opens straight from disk, styled, with working tabs.
  const root = test.info().outputPath("export");
  for (const [name, data] of files) {
    const path = join(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
  }
  await page.goto(`file://${join(root, slug, "index.html")}`);
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expect(page.getByText("First panel")).toBeVisible();
  await page.getByRole("tab", { name: "First" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Second" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Second panel")).toBeVisible();
});
