import { expect, test, type Locator } from "@playwright/test";
import { createPage, setUpEmvbOnce } from "./support/api.ts";
import { openEditor, openLayers, overlay, unique } from "./support/helpers.ts";

setUpEmvbOnce();
test.use({ viewport: { width: 1440, height: 900 } });

for (const motion of ["no-preference", "reduce"] as const) {
  test(`W-722: editor panels provide restrained feedback with ${motion} motion`, async ({
    page,
    request,
  }) => {
    await page.emulateMedia({ reducedMotion: motion });
    const id = await createPage(
      request,
      "Panel feedback",
      {
        schemaVersion: 16,
        root: {
          id: "root0001",
          type: "container",
          props: {},
          children: [
            { id: "head0001", type: "heading", props: { text: "Panel feedback", level: 2 } },
          ],
        },
      },
      `panel-feedback-${unique()}`,
    );
    await openEditor(page, id, "Panel feedback");
    const frame = page.locator("iframe[data-emvb-canvas]");
    const initialWidth = await frame.evaluate((el) => el.getBoundingClientRect().width);
    const check = async (panel: Locator) => {
      await expect(panel).toHaveCSS(
        "animation-name",
        motion === "reduce" ? "none" : "emvb-panel-enter",
      );
      await expect(panel).toHaveCSS("animation-duration", motion === "reduce" ? "0s" : "0.15s");
      await expect(panel).toHaveCSS("opacity", "1");
      await expect(panel).toHaveCSS("transform", "none");
    };

    await overlay(page).getByRole("tab", { name: "Add", exact: true }).click();
    await check(overlay(page).locator('[data-emvb-panel="add"]'));
    await openLayers(page);
    await check(overlay(page).locator('[data-emvb-panel="layers"]'));
    await overlay(page).locator('[data-emvb-layer="head0001"] .emvb-layer-select').click();
    const content = overlay(page).locator('[data-emvb-tab="content"]');
    await check(content);
    const original = await content.elementHandle();
    const text = overlay(page).getByLabel("Text", { exact: true });
    await text.fill("Responsive feedback");
    await text.press("Enter");
    expect(await content.evaluate((el, before) => el === before, original)).toBe(true);
    await expect(text).toBeFocused();
    await overlay(page).getByRole("tab", { name: "Style", exact: true }).click();
    await check(overlay(page).locator('[data-emvb-tab="style"]'));

    await overlay(page).getByRole("button", { name: "Site styles", exact: true }).click();
    await check(overlay(page).locator('[data-emvb-site-tab="variables"]'));
    await overlay(page).getByRole("tab", { name: "Classes", exact: true }).click();
    await check(overlay(page).locator('[data-emvb-site-tab="classes"]'));
    await overlay(page).getByRole("tab", { name: "Defaults", exact: true }).click();
    await check(overlay(page).locator('[data-emvb-site-tab="defaults"]'));
    expect(await frame.evaluate((el) => el.getBoundingClientRect().width)).toBe(initialWidth);
    await page.screenshot({
      path: `/tmp/emvb-panel-feedback-${test.info().project.name}-${motion}.png`,
    });
  });
}
