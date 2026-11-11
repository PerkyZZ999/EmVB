import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createPage, setUpEmvbOnce } from "./support/api.ts";
import { unique } from "./support/helpers.ts";

setUpEmvbOnce();

const layout = (text: string) => ({
  schemaVersion: 18,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "text0001", type: "text", props: { text } }],
  },
});

test("W-978: search the Pages list by content, then publish, delete and restore the matches", async ({
  page,
  request,
}) => {
  const word = `zebra${unique().replace(/\W/g, "")}`;
  const titles = [`Bulk one ${unique()}`, `Bulk two ${unique()}`];
  for (const title of titles)
    // oxlint-disable-next-line no-await-in-loop -- two pages, in order
    await createPage(request, title, layout(`A page about ${word} stripes`), `bulk-${unique()}`);

  await page.goto("/_emdash/admin/plugins/emvb/pages");
  await page.getByRole("searchbox", { name: "Search pages" }).fill(word);
  const rows = page.locator("[data-emvb-row]");
  await expect(rows).toHaveCount(2);
  await expect(page.locator("[data-emvb-found-in]").first()).toContainText(word);

  // Each row's own box can be clicked (the title link stretches over the row).
  await page.getByRole("checkbox", { name: `Select ${titles[0]}` }).click();
  const bar = page.locator("[data-emvb-bulk-bar]");
  await expect(bar).toContainText("1 page selected");
  await page.getByRole("checkbox", { name: `Select ${titles[1]}` }).click();
  await expect(bar).toContainText("2 pages selected");
  const axe = await new AxeBuilder({ page }).include("[data-emvb-bulk-bar]").analyze();
  expect(
    axe.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")).map((v) => v.id),
  ).toEqual([]);

  await bar.getByRole("button", { name: "Publish" }).click();
  await expect(bar.locator("[data-emvb-bulk-status]")).toContainText("Published 2 pages.");
  await expect(rows.locator('[data-status="published"]')).toHaveCount(2);

  await page.getByRole("checkbox", { name: "Select all pages shown" }).click();
  await bar.getByRole("button", { name: "Delete" }).click();
  const confirm = page.locator('[data-emvb-dialog="bulk-delete"]');
  await expect(confirm).toContainText(titles[0] ?? "");
  await confirm.getByRole("button", { name: "Delete 2 pages" }).click();
  await expect(bar.locator("[data-emvb-bulk-status]")).toContainText(
    "Moved to the trash: 2 pages.",
  );
  await expect(rows).toHaveCount(0);

  await bar.getByRole("button", { name: "Restore" }).click();
  await expect(bar.locator("[data-emvb-bulk-status]")).toContainText("Restored 2 pages.");
  await expect(rows).toHaveCount(2);

  // Leave nothing behind: back to the trash.
  await page.getByRole("checkbox", { name: "Select all pages shown" }).click();
  await bar.getByRole("button", { name: "Delete" }).click();
  await confirm.getByRole("button", { name: "Delete 2 pages" }).click();
  await expect(rows).toHaveCount(0);
});
