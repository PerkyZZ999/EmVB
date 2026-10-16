import { expect, test } from "@playwright/test";
import { setUpEmvbOnce } from "./support/api.ts";

setUpEmvbOnce();

test("W-709: retry a failed list request in Visual pages and Theme Builder", async ({ page }) => {
  for (const [collection, route, createLabel] of [
    ["emvb_pages", "pages", "New page"],
    ["emvb_theme_parts", "theme", "New theme part"],
  ] as const) {
    const pattern = `**/_emdash/api/content/${collection}?*`;
    let requests = 0;
    await page.route(pattern, async (request) => {
      requests += 1;
      if (requests === 1) {
        await request.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "UNAVAILABLE", message: "Temporarily unavailable" },
          }),
        });
      } else {
        await request.continue();
      }
    });
    await page.goto(`/_emdash/admin/plugins/emvb/${route}`);
    await expect(page.getByRole("alert")).toContainText("Temporarily unavailable");
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByRole("button", { name: createLabel, exact: true })).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(requests).toBeGreaterThanOrEqual(2);
    await page.unroute(pattern);
  }
});
