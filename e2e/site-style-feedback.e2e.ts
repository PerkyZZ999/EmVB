import { expect, test } from "@playwright/test";
import { createPage, setUpEmvbOnce } from "./support/api.ts";
import { openEditor, overlay, unique } from "./support/helpers.ts";

setUpEmvbOnce();
test.use({ viewport: { width: 1440, height: 900 } });

test("W-724: publishing site styles shows stable pending feedback and recovers from failure", async ({
  page,
  request,
}) => {
  const id = await createPage(
    request,
    "Style publish feedback",
    {
      schemaVersion: 17,
      root: { id: "root0001", type: "container", props: {}, children: [] },
    },
    `style-feedback-${unique()}`,
  );
  await page.route("**/_emdash/api/plugins/emvb/design/draft*", async (route) => {
    const upstream = await route.fetch();
    expect(upstream.ok()).toBe(true);
    const body = (await upstream.json()) as { data: Record<string, unknown> };
    await route.fulfill({
      response: upstream,
      json: { ...body, data: { ...body.data, unpublished: true } },
    });
  });
  const release = Promise.withResolvers<void>();
  let publishes = 0;
  await page.route("**/_emdash/api/plugins/emvb/design/publish", async (route) => {
    if (++publishes === 1) {
      await release.promise;
      await route.fulfill({
        status: 503,
        json: { error: { code: "UNAVAILABLE", message: "Temporary style publish failure" } },
      });
    } else {
      await route.fulfill({ json: { data: { revision: "w724-simulated-publish" } } });
    }
  });
  try {
    await openEditor(page, id);
    await overlay(page).getByRole("button", { name: "Site styles", exact: true }).click();
    const publish = overlay(page).getByRole("button", { name: /Publish styles$/ });
    const status = overlay(page).getByRole("status", { name: "Site styles status", exact: true });
    const beforeWidth = await publish.evaluate((el) => el.getBoundingClientRect().width);
    const beforeHeight = await status.evaluate((el) => el.getBoundingClientRect().height);

    await publish.click();
    await expect.poll(() => publishes).toBe(1);
    await expect(publish).toBeDisabled();
    await expect(publish).toHaveAttribute("aria-busy", "true");
    await expect(status).toHaveText("Publishing site styles…");
    await expect(publish.locator('svg[role="status"]')).toHaveCount(1);
    expect(await publish.evaluate((el) => el.getBoundingClientRect().width)).toBe(beforeWidth);
    expect(await status.evaluate((el) => el.getBoundingClientRect().height)).toBe(beforeHeight);
    await page.screenshot({ path: `/tmp/emvb-style-publish-${test.info().project.name}.png` });

    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(publish.locator('svg[role="status"]')).toHaveCount(0);
    await expect(publish.locator("animate, animateTransform")).toHaveCount(0);
    await expect(publish).toBeDisabled();
    await expect(status).toHaveText("Publishing site styles…");
    expect(await publish.evaluate((el) => el.getBoundingClientRect().width)).toBe(beforeWidth);
    await page.screenshot({
      path: `/tmp/emvb-style-publish-${test.info().project.name}-reduce.png`,
    });

    release.resolve();
    await expect(overlay(page).getByRole("alert")).toContainText("Temporary style publish failure");
    await expect(publish).toBeEnabled();
    await expect(publish).toHaveAttribute("aria-busy", "false");
    await publish.click();
    await expect(publish).toHaveCount(0);
    await expect(overlay(page).getByRole("alert")).toHaveCount(0);
    await expect(status).not.toContainText("Publishing");
    expect(publishes).toBe(2);
  } finally {
    release.resolve();
  }
});
