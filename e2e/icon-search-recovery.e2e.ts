import { expect, test } from "@playwright/test";
import { createPage, setUpEmvbOnce } from "./support/api.ts";
import { canvas, openEditor, openLayers, overlay, unique } from "./support/helpers.ts";

setUpEmvbOnce();
test.use({ viewport: { width: 1440, height: 900 } });

test("W-737: unmatched icon searches recover by keyboard with the category and selection retained", async ({
  page,
  request,
}) => {
  const id = await createPage(
    request,
    "Icon search recovery",
    {
      schemaVersion: 16,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [{ id: "icon0001", type: "icon", props: { iconId: "star", title: "Star" } }],
      },
    },
    `icon-search-recovery-${unique()}`,
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openEditor(page, id);
  await openLayers(page);
  await overlay(page).locator('[data-emvb-layer="icon0001"] .emvb-layer-select').click();
  const opener = overlay(page).locator("[data-emvb-icon-open]");
  const frame = overlay(page).locator("iframe[data-emvb-canvas]");
  const icon = canvas(page).locator('[data-emvb-id="icon0001"]');
  const markup = await icon.innerHTML();
  const frameWidth = await frame.evaluate((element) => element.getBoundingClientRect().width);
  await opener.click();
  const popup = page.getByRole("dialog", { name: "Icon library", exact: true });
  const picked = popup.locator("[data-emvb-icon-picked]");
  const search = popup.getByRole("searchbox", { name: "Search icons", exact: true });
  const clear = popup.getByRole("button", { name: "Clear search", exact: true });
  const category = popup.locator('[data-emvb-icon-category="lucide"]');
  const grid = popup.getByRole("listbox", { name: "Lucide icons", exact: true });
  await expect(picked).toHaveAttribute("data-emvb-icon-picked", "lucide:star");
  await expect(grid).toBeVisible();
  await popup.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  const geometry = await popup.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    height: element.getBoundingClientRect().height,
  }));
  for (const preference of ["no-preference", "reduce"] as const) {
    await page.emulateMedia({ reducedMotion: preference });
    await search.fill("zzzz qqqq");
    await expect(popup.getByRole("status")).toHaveText('No icons match "zzzz qqqq" in Lucide.');
    await expect(grid).toHaveCount(0);
    await search.press("Tab");
    await expect(clear).toBeFocused();
    await page.screenshot({
      path: `/tmp/emvb-icon-search-${test.info().project.name}-${preference}.png`,
    });
    await page.keyboard.press("Enter");
    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
    await expect(clear).toHaveCount(0);
    await expect(grid).toBeVisible();
    await expect(category).toHaveAttribute("aria-current", "true");
    await expect(picked).toHaveAttribute("data-emvb-icon-picked", "lucide:star");
    await expect(popup.locator('[data-emvb-icon-id="lucide:star"]')).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(popup.getByRole("button", { name: "Insert", exact: true })).toBeEnabled();
    expect(
      await popup.evaluate((element) => ({
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
      })),
    ).toEqual(geometry);
    await search.press("ArrowDown");
    await expect(grid).toBeFocused();
  }
  await popup.getByRole("button", { name: "Close", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(popup).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(await icon.innerHTML()).toBe(markup);
  expect(await frame.evaluate((element) => element.getBoundingClientRect().width)).toBe(frameWidth);
  await expect(overlay(page).locator("[data-emvb-icon-current]")).toHaveAttribute(
    "data-emvb-icon-current",
    "star",
  );
});
