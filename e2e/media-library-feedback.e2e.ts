import { expect, test } from "@playwright/test";
import { createPage, setUpEmvbOnce } from "./support/api.ts";
import { canvas, openEditor, openLayers, overlay, unique } from "./support/helpers.ts";

setUpEmvbOnce();
test.use({ viewport: { width: 1440, height: 900 } });

test("W-740: media library retry retains keyboard focus through loading, empty and ready results", async ({
  page,
  request,
}) => {
  const id = await createPage(
    request,
    "Media library focus",
    {
      schemaVersion: 16,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "img00001",
            type: "image",
            props: { src: "/emvb-library-original.png", alt: "Original" },
          },
        ],
      },
    },
    `media-library-focus-${unique()}`,
  );
  await page.route("**/emvb-library-*.png", (route) =>
    route.fulfill({ path: "e2e/fixtures/emvb-pixel.png", contentType: "image/png" }),
  );
  const empty = Promise.withResolvers<void>();
  const ready = Promise.withResolvers<void>();
  let attempts = 0;
  await page.route("**/_emdash/api/media?*", async (route) => {
    const attempt = ++attempts;
    if (attempt % 2 === 1) {
      await route.fulfill({
        status: 503,
        json: { error: { message: "Library temporarily unavailable." } },
      });
      return;
    }
    await (attempt === 2 ? empty.promise : ready.promise);
    await route.fulfill({
      json: {
        data: {
          items:
            attempt === 2
              ? []
              : [
                  {
                    id: "focus-image",
                    filename: "focus.png",
                    url: "/emvb-library-choice.png",
                    status: "ready",
                    alt: "Focus image",
                  },
                ],
        },
      },
    });
  });
  try {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await openEditor(page, id);
    await openLayers(page);
    await overlay(page).locator('[data-emvb-layer="img00001"] .emvb-layer-select').click();
    const opener = overlay(page).getByRole("button", { name: "Choose from library", exact: true });
    const library = overlay(page).getByRole("dialog", { name: "Media library", exact: true });
    const close = library.getByRole("button", { name: "Close", exact: true });
    const image = canvas(page).locator('[data-emvb-id="img00001"]');
    const markup = await image.innerHTML();
    const frame = overlay(page).locator("iframe[data-emvb-canvas]");
    const frameWidth = await frame.evaluate((element) => element.getBoundingClientRect().width);
    for (const result of ["empty", "ready"] as const) {
      await opener.focus();
      await page.keyboard.press("Enter");
      await expect(library.getByRole("alert")).toContainText("Library temporarily unavailable.");
      await library.getByRole("button", { name: "Retry", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(library.getByRole("status")).toHaveText("Loading…");
      await expect(library.getByRole("alert")).toHaveCount(0);
      await expect(close).toBeFocused();
      if (result === "empty") {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await expect(close).toBeFocused();
        empty.resolve();
        await expect(library).toContainText("No images yet. Upload one to get started.");
      } else {
        ready.resolve();
        await expect(library.locator('[data-emvb-media-id="focus-image"]')).toBeVisible();
        await expect(library).not.toContainText("No images yet.");
      }
      await expect(library.getByRole("status")).toHaveCount(0);
      await expect(close).toBeFocused();
      await page.screenshot({
        path: `/tmp/emvb-media-library-${test.info().project.name}-${result}.png`,
      });
      if (result === "ready") {
        await close.press("Tab");
        await expect(library.locator('[data-emvb-media-id="focus-image"]')).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(close).toBeFocused();
      }
      await page.keyboard.press("Enter");
      await expect(library).toHaveCount(0);
    }
    expect(attempts).toBe(4);
    await expect(overlay(page).getByLabel("Or paste a URL")).toHaveValue(
      "/emvb-library-original.png",
    );
    expect(await image.innerHTML()).toBe(markup);
    expect(await frame.evaluate((element) => element.getBoundingClientRect().width)).toBe(
      frameWidth,
    );
  } finally {
    empty.resolve();
    ready.resolve();
  }
});
