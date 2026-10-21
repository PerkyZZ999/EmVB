import { expect, test } from "@playwright/test";
import { createPage, setUpEmvbOnce } from "./support/api.ts";
import { openEditor, overlay, saveStatus, unique } from "./support/helpers.ts";

setUpEmvbOnce();
test.use({ viewport: { width: 1440, height: 900 } });

for (const action of ["save", "publish"] as const) {
  test(`W-726: ${action} keeps geometry and feedback when motion changes and requests fail`, async ({
    page,
    request,
  }) => {
    const id = await createPage(
      request,
      "Top bar feedback",
      {
        schemaVersion: 17,
        root: { id: "root0001", type: "container", props: {}, children: [] },
      },
      `top-feedback-${action}-${unique()}`,
    );
    if (action === "save") await page.setViewportSize({ width: 1024, height: 900 });
    await openEditor(page, id);
    const release = Promise.withResolvers<void>();
    let writes = 0;
    await page.route(
      `**/_emdash/api/content/emvb_pages/${id}${action === "publish" ? "/publish" : ""}`,
      async (route) => {
        if (++writes === 1) {
          await release.promise;
          await route.fulfill({
            status: 503,
            json: { error: { code: "UNAVAILABLE", message: "Temporary test failure" } },
          });
        } else {
          await route.fulfill({
            json: {
              data: { _rev: "w726-simulated-revision", item: { slug: `top-feedback-${action}` } },
            },
          });
        }
      },
    );
    try {
      const active = overlay(page).locator(`.emvb-${action}-button`);
      const other = overlay(page).locator(`.emvb-${action === "save" ? "publish" : "save"}-button`);
      const canvas = overlay(page).locator("iframe[data-emvb-canvas]");
      const before = await active.evaluate((el) => el.getBoundingClientRect().width);
      const beforeCanvas = await canvas.evaluate((el) => el.getBoundingClientRect().width);
      expect(await other.evaluate((el) => el.getBoundingClientRect().right)).toBeLessThanOrEqual(
        page.viewportSize()?.width ?? 0,
      );
      await active.click();
      await expect.poll(() => writes).toBe(1);
      await expect(active).toBeDisabled();
      await expect(other).toBeDisabled();
      await expect(active).toHaveAttribute("aria-busy", "true");
      await expect(other).toHaveAttribute("aria-busy", "false");
      await expect(saveStatus(page)).toHaveText(action === "save" ? "Saving…" : "Publishing…");
      await expect(active.locator('svg[role="status"]')).toHaveCount(1);
      expect(await active.evaluate((el) => el.getBoundingClientRect().width)).toBe(before);
      expect(await canvas.evaluate((el) => el.getBoundingClientRect().width)).toBe(beforeCanvas);
      await page.screenshot({
        path: `/tmp/emvb-top-feedback-${test.info().project.name}-${action}.png`,
      });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(active.locator('svg[role="status"], animate, animateTransform')).toHaveCount(0);
      await expect(active.locator('svg[aria-hidden="true"]')).toHaveCount(1);
      await expect(active).toBeDisabled();
      await expect(saveStatus(page)).toHaveText(action === "save" ? "Saving…" : "Publishing…");
      expect(await active.evaluate((el) => el.getBoundingClientRect().width)).toBe(before);
      expect(await canvas.evaluate((el) => el.getBoundingClientRect().width)).toBe(beforeCanvas);
      await page.screenshot({
        path: `/tmp/emvb-top-feedback-${test.info().project.name}-${action}-reduce.png`,
      });
      release.resolve();
      await expect(saveStatus(page)).toContainText(
        action === "save" ? "Couldn't save." : "Couldn't publish.",
      );
      await expect(active).toBeEnabled();
      await expect(other).toBeEnabled();
      await expect(active).toHaveAttribute("aria-busy", "false");
      if (action === "save")
        await saveStatus(page).getByRole("button", { name: "Retry", exact: true }).click();
      else await active.click();
      await expect(saveStatus(page)).toHaveText("Saved");
      await expect(active).toBeEnabled();
      expect(writes).toBe(2);
    } finally {
      release.resolve();
    }
  });
}
