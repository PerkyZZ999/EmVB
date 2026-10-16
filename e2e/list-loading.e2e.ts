import { expect, test } from "@playwright/test";
import { setUpEmvbOnce } from "./support/api.ts";

setUpEmvbOnce();

for (const [route, collection, label, empty, action] of [
  ["pages", "emvb_pages", "Loading pages…", "No visual pages yet", "New page"],
  ["theme", "emvb_theme_parts", "Loading theme parts…", "No site parts yet", "New theme part"],
] as const) {
  for (const motion of ["no-preference", "reduce"] as const) {
    test(`W-723: ${route} loading feedback respects ${motion} motion and resolves to an empty state`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: motion });
      const release = Promise.withResolvers<void>();
      await page.route(`**/_emdash/api/content/${collection}?*`, async (request) => {
        await release.promise;
        await request.fulfill({ json: { data: { items: [] } } });
      });
      try {
        await page.goto(`/_emdash/admin/plugins/emvb/${route}`);
        const loading = page.getByRole("status", { name: label, exact: true });
        await expect(loading).toBeVisible();
        await expect(loading).toContainText(label);
        await expect(loading.locator(".emvb-list-skeleton-row")).toHaveCount(3);
        await expect(loading.locator(".emvb-list-skeleton-rows")).toHaveAttribute(
          "aria-hidden",
          "true",
        );
        expect(
          await loading.evaluate((el) => el.getBoundingClientRect().height),
        ).toBeGreaterThanOrEqual(200);
        const line = loading.locator(".skeleton-line").first();
        await expect
          .poll(() => line.evaluate((el) => getComputedStyle(el, "::after").animationName))
          .toBe(motion === "reduce" ? "none" : "shimmer");
        await expect(page.getByText(empty, { exact: true })).toHaveCount(0);
        await page.screenshot({
          path: `/tmp/emvb-list-loading-${test.info().project.name}-${route}-${motion}.png`,
        });

        release.resolve();
        await expect(loading).toHaveCount(0);
        await expect(page.getByText(empty, { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: action, exact: true })).toBeEnabled();
      } finally {
        release.resolve();
      }
    });
  }
}
