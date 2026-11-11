import { expect, test } from "@playwright/test";

// W-984: in the production build, Tab never leaves an EmVB dialog (Base UI's end guard could
// let focus fall to the page behind). The image editor has its own check (W-487).
test.use({
  // oxlint-disable-next-line no-empty-pattern -- Playwright reads fixture names from the pattern.
  storageState: async ({}, use, info) => use((info.project.metadata as { auth: string }).auth),
  viewport: { width: 1440, height: 900 },
});

test("W-984: Tab and Shift+Tab stay inside the Export pages dialog", async ({ page }) => {
  await page.goto("/_emdash/admin/plugins/emvb/pages");
  await page.getByRole("button", { name: "Export pages", exact: true }).click();
  const dialog = page.locator('[data-emvb-dialog="export-pages"]');
  await expect(dialog).toBeVisible();
  const inside = () =>
    page.evaluate(() => {
      const el = document.activeElement;
      return !!el?.closest('[role="dialog"]')?.querySelector('[data-emvb-dialog="export-pages"]');
    });
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    expect(await inside()).toBe(true);
  }
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await inside()).toBe(true);
  }
});
