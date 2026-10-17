import { expect, test } from "@playwright/test";
import { createPage, setUpEmvbOnce } from "./support/api.ts";
import { canvas, openEditor, overlay, unique } from "./support/helpers.ts";

setUpEmvbOnce();

for (const preference of ["no-preference", "reduce"] as const) {
  test(`W-733: toast feedback honors ${preference} motion and keeps keyboard recovery available`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: preference === "reduce" ? 1024 : 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: preference });
    const id = await createPage(
      request,
      "Toast feedback",
      {
        schemaVersion: 16,
        root: {
          id: "root0001",
          type: "container",
          props: {},
          children: [
            { id: "head0001", type: "heading", props: { text: "Restore me", level: 1 } },
            { id: "head0002", type: "heading", props: { text: "Keep me", level: 2 } },
          ],
        },
      },
      `toast-feedback-${unique()}`,
    );
    await openEditor(page, id, "Restore me");
    await page.evaluate(() => {
      const host = document.createElement("div");
      host.setAttribute("data-host-toast-probe", "");
      host.style.transition = "opacity 0.2s";
      document.body.append(host);
    });
    const frame = page.locator("iframe[data-emvb-canvas]");
    const geometry = await frame.evaluate((element) => element.getBoundingClientRect().toJSON());
    const remove = async () => {
      await canvas(page).getByRole("heading", { name: "Restore me", exact: true }).click();
      await overlay(page).getByRole("button", { name: "Delete element", exact: true }).click();
      await expect(canvas(page).getByRole("heading", { name: "Restore me" })).toHaveCount(0);
    };
    await remove();
    const toast = page.getByRole("dialog", { name: "Heading deleted", exact: true });
    await expect(toast).toBeVisible();
    const content = toast.locator(":scope > .isolate");
    await expect(toast).toHaveCSS(
      "transition-duration",
      preference === "reduce" ? "0s" : "0.5s, 0.5s, 0.15s",
    );
    await expect(content).toHaveCSS(
      "transition-duration",
      preference === "reduce" ? "0s" : "0.25s",
    );
    const restore = toast.getByRole("button", { name: "Restore", exact: true });
    await restore.focus();
    await expect(restore).toBeFocused();
    await page.screenshot({
      animations: "disabled",
      path: `/tmp/emvb-toast-feedback-${test.info().project.name}-${preference}.png`,
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(toast).toHaveCSS("transition-duration", "0s");
    await expect(content).toHaveCSS("transition-duration", "0s");
    await expect(restore).toBeFocused();
    await expect(page.locator("[data-host-toast-probe]")).toHaveCSS("transition-duration", "0.2s");
    expect(
      await restore.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
        );
      }),
    ).toBe(true);
    await restore.press("Enter");
    await expect(toast).toHaveCount(0);
    await expect(canvas(page).getByRole("heading")).toHaveText(["Restore me", "Keep me"]);
    await expect(overlay(page).locator('[data-emvb-selected="head0001"]')).toBeVisible();

    await remove();
    await expect(toast).toBeVisible();
    await toast.focus();
    await expect(toast).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(toast.getByRole("button", { name: "Restore", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    const close = toast.getByRole("button", { name: "Close", exact: true });
    await expect(close).toBeFocused();
    await close.press("Enter");
    await expect(toast).toHaveCount(0);
    await expect(canvas(page).getByRole("heading")).toHaveText(["Keep me"]);
    expect(await frame.evaluate((element) => element.getBoundingClientRect().toJSON())).toEqual(
      geometry,
    );
  });
}
