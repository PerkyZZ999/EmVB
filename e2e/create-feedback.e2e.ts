import { expect, test, type Page } from "@playwright/test";
import { setUpEmvbOnce } from "./support/api.ts";

setUpEmvbOnce();

async function settleDialog(page: Page) {
  await page.evaluate(async () => {
    const element = document.querySelector('[role="dialog"]');
    await Promise.all(
      (element?.getAnimations({ subtree: true }) ?? [])
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
}

for (const [path, collection, dialog, action, noun] of [
  ["pages", "emvb_pages", "new-page", "New page", "page"],
  ["theme", "emvb_theme_parts", "new-theme-part", "New theme part", "theme part"],
] as const) {
  test(`W-727: ${dialog} keeps pending feedback stable and recovers without losing fields`, async ({
    page,
  }) => {
    await page.route("**/_emdash/api/content/*?*", async (route) => {
      await route.fulfill({
        json: {
          data: {
            items:
              path === "pages" && route.request().url().includes("emvb_theme_parts")
                ? [
                    {
                      id: "template01",
                      slug: "starter",
                      status: "draft",
                      data: { title: "Starter", part_type: "page_template" },
                    },
                  ]
                : [],
          },
        },
      });
    });
    const release = Promise.withResolvers<void>();
    const titles: string[] = [];
    await page.route(`**/_emdash/api/content/${collection}`, async (route) => {
      const body = route.request().postDataJSON() as { data: { title: string } };
      titles.push(body.data.title);
      if (titles.length === 1) await release.promise;
      await route.fulfill({
        status: 503,
        json: { error: { code: "BUSY", message: "Try again shortly" } },
      });
    });
    try {
      await page.goto(`/_emdash/admin/plugins/emvb/${path}`);
      await page.getByRole("button", { name: action, exact: true }).click();
      const form = page.locator(`[data-emvb-dialog="${dialog}"]`);
      const title = form.getByRole("textbox", { name: "Title", exact: true });
      const slug = form.getByRole("textbox", { name: "Slug", exact: true });
      await expect(form.getByRole("combobox")).toBeVisible();
      await title.fill("Pending creation");
      await slug.fill("pending-custom");
      await settleDialog(page);
      const submit = form.locator('button[type="submit"]');
      const cancel = form.getByRole("button", { name: "Cancel", exact: true });
      const status = form.getByRole("status", { name: "Creation status", exact: true });
      const width = await submit.evaluate((el) => el.getBoundingClientRect().width);
      const height = await form.evaluate((el) => el.getBoundingClientRect().height);
      await submit.click();
      await expect.poll(() => titles.length).toBe(1);
      await expect(status).toHaveText(`Creating ${noun}…`);
      await expect(submit).toBeDisabled();
      await expect(submit).toHaveAttribute("aria-busy", "true");
      await expect(cancel).toBeDisabled();
      await expect(title).toBeDisabled();
      await expect(slug).toBeDisabled();
      await expect(form.getByRole("combobox")).toBeDisabled();
      await expect(submit.locator('svg[role="status"]')).toHaveCount(1);
      expect(await submit.evaluate((el) => el.getBoundingClientRect().width)).toBe(width);
      expect(await form.evaluate((el) => el.getBoundingClientRect().height)).toBe(height);
      await page.keyboard.press("Escape");
      await settleDialog(page);
      await expect(form).toBeVisible();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(submit.locator('svg[role="status"], animate, animateTransform')).toHaveCount(0);
      await expect(status).toHaveText(`Creating ${noun}…`);
      await expect(submit).toBeDisabled();
      expect(await submit.evaluate((el) => el.getBoundingClientRect().width)).toBe(width);
      expect(await form.evaluate((el) => el.getBoundingClientRect().height)).toBe(height);
      await page.screenshot({
        path: `/tmp/emvb-create-feedback-${test.info().project.name}-${dialog}-reduce.png`,
      });
      release.resolve();
      await expect(form.getByRole("alert")).toHaveText(
        `Couldn't create the ${noun}. Try again shortly`,
      );
      await expect(submit).toBeEnabled();
      await expect(submit).toHaveAttribute("aria-busy", "false");
      await expect(cancel).toBeEnabled();
      await expect(title).toBeEnabled();
      await expect(form.getByRole("combobox")).toBeEnabled();
      await expect(slug).toHaveValue("pending-custom");
      await title.fill("Retry creation");
      await submit.click();
      await expect.poll(() => titles).toEqual(["Pending creation", "Retry creation"]);
      await expect(form.getByRole("alert")).toBeVisible();
      await expect(submit).toBeEnabled();
      await cancel.click();
      await expect(form).toHaveCount(0);
    } finally {
      release.resolve();
    }
  });
}
