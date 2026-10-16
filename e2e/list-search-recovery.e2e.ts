import { expect, test } from "@playwright/test";
import { setUpEmvbOnce } from "./support/api.ts";

setUpEmvbOnce();

for (const [route, collection, label] of [
  ["pages", "emvb_pages", "Search pages"],
  ["theme", "emvb_theme_parts", "Search theme parts"],
] as const) {
  test(`W-725: ${route} unmatched search recovers by keyboard with focus retained`, async ({
    page,
  }) => {
    let requests = 0;
    await page.route(`**/_emdash/api/content/${collection}?*`, async (request) => {
      requests++;
      await request.fulfill({
        json: {
          data: {
            items: [
              {
                id: "01A",
                slug: "about",
                status: "draft",
                data: { title: "About", part_type: "header" },
              },
              {
                id: "01B",
                slug: "pricing",
                status: "draft",
                data: { title: "Pricing", part_type: "footer" },
              },
            ],
          },
        },
      });
    });
    await page.goto(`/_emdash/admin/plugins/emvb/${route}`);
    if (route === "theme") await page.getByRole("tab", { name: "Headers1", exact: true }).click();
    const search = page.getByRole("searchbox", { name: label, exact: true });
    await search.fill("zzz");
    await expect(page.locator("[data-emvb-no-matches][role=status]")).toHaveText(
      'Nothing matches "zzz".',
    );
    await expect(page.locator("[data-emvb-row]")).toHaveCount(0);
    await page.keyboard.press("Tab");
    const clear = page.getByRole("button", { name: "Clear search", exact: true });
    await expect(clear).toBeFocused();
    await page.screenshot({
      path: `/tmp/emvb-list-search-${test.info().project.name}-${route}.png`,
    });
    await page.keyboard.press("Enter");
    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
    await expect(clear).toHaveCount(0);
    await expect(page.locator("[data-emvb-row]")).toHaveCount(route === "pages" ? 2 : 1);
    if (route === "theme") {
      await expect(page.getByRole("tab", { name: "Headers1", exact: true })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(page.locator('[data-emvb-row="01B"]')).toHaveCount(0);
    }
    expect(requests).toBe(1);
  });
}
