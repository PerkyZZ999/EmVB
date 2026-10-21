import { expect, test } from "@playwright/test";
import { createPage, setUpEmvbOnce } from "./support/api.ts";
import { openEditor, overlay, unique } from "./support/helpers.ts";

setUpEmvbOnce();
test.use({ viewport: { width: 1440, height: 900 } });

test("W-736: timeline progress stays distinct from failures and empty results through recovery", async ({
  page,
  request,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const layout = {
    schemaVersion: 17,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        { id: "head0001", type: "heading", props: { text: "Timeline feedback", level: 1 } },
      ],
    },
  };
  const id = await createPage(
    request,
    "Timeline feedback",
    layout,
    `timeline-feedback-${unique()}`,
  );
  const first = Promise.withResolvers<void>();
  const second = Promise.withResolvers<void>();
  const metadata = Promise.withResolvers<void>();
  let revisionRequests = 0;
  let agentRequests = 0;
  await page.route(`**/_emdash/api/content/emvb_pages/${id}/revisions?*`, async (route) => {
    const attempt = ++revisionRequests;
    if (attempt === 1) {
      await first.promise;
      await route.fulfill({
        status: 503,
        json: { error: { code: "BUSY", message: "Try again." } },
      });
    } else {
      if (attempt === 2) await second.promise;
      await route.fulfill({
        json: {
          data: {
            items:
              attempt === 2
                ? []
                : [{ id: "r1", createdAt: "2026-10-15T10:00:00Z", data: { layout } }],
          },
        },
      });
    }
  });
  await page.route("**/_emdash/api/plugins/emvb/agents/page", async (route) => {
    if (++agentRequests === 1) {
      await metadata.promise;
      await route.fulfill({
        status: 503,
        json: { error: { code: "BUSY", message: "Try later." } },
      });
    } else
      await route.fulfill({
        json: {
          data: {
            versions: [{ revisionId: "r1", tool: "update_element", summary: "Updated the page" }],
          },
        },
      });
  });
  try {
    await openEditor(page, id, "Timeline feedback");
    const opener = overlay(page).getByRole("button", { name: "Version timeline", exact: true });
    const frame = overlay(page).locator("iframe[data-emvb-canvas]");
    const width = await frame.evaluate((element) => element.getBoundingClientRect().width);
    const popup = page.getByRole("dialog", { name: "Version timeline", exact: true });
    const status = popup.getByRole("status", { name: "Version timeline status", exact: true });
    const empty = popup.locator("[data-emvb-timeline-empty]");
    const close = async () => {
      await popup.getByRole("button", { name: "Close", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(popup).toHaveCount(0);
      await expect(opener).toBeFocused();
      expect(await frame.evaluate((element) => element.getBoundingClientRect().width)).toBe(width);
    };

    await opener.click();
    await expect(status).toHaveText("Loading versions…");
    await expect(empty).toHaveCount(0);
    await expect(popup.getByRole("alert")).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(popup).toHaveCSS("transition-duration", "0s");
    await expect(status).toHaveText("Loading versions…");
    await page.screenshot({ path: `/tmp/emvb-timeline-${test.info().project.name}-loading.png` });
    first.resolve();
    await expect(popup.getByRole("alert")).toHaveText("Couldn't load versions: Try again.");
    await expect(status).toHaveCount(0);
    await expect(empty).toHaveCount(0);
    await close();

    await opener.click();
    await expect(status).toHaveText("Loading versions…");
    await expect(popup.getByRole("alert")).toHaveCount(0);
    second.resolve();
    await expect.poll(() => agentRequests).toBe(1);
    await expect(status).toHaveText("Loading versions…");
    await expect(empty).toHaveCount(0);
    metadata.resolve();
    await expect(empty).toHaveText("No saved versions yet. Each save adds one.");
    await expect(status).toHaveCount(0);
    await expect(popup.getByRole("alert")).toHaveCount(0);
    await close();

    await opener.click();
    const version = popup.locator('[data-emvb-version="r1"]');
    await expect(version).toHaveAttribute("aria-current", "true");
    await expect(popup.getByTitle("Saved version", { exact: true })).toHaveCount(1);
    await expect(popup.getByTitle("Current page", { exact: true })).toHaveCount(1);
    await popup.locator('[data-emvb-timeline-who="people"]').click();
    await expect(empty).toContainText("Choose All to see every version.");
    await expect(version).toHaveCount(0);
    await page.screenshot({ path: `/tmp/emvb-timeline-${test.info().project.name}-filtered.png` });
    await popup.locator('[data-emvb-timeline-who="all"]').click();
    await expect(version).toHaveAttribute("aria-current", "true");
    await expect(empty).toHaveCount(0);
    await close();
    expect(revisionRequests).toBe(3);
    expect(agentRequests).toBe(2);
  } finally {
    first.resolve();
    second.resolve();
    metadata.resolve();
  }
});
