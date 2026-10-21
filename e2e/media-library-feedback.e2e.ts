import { expect, test } from "@playwright/test";
import { createPage, setUpEmvbOnce } from "./support/api.ts";
import { canvas, openEditor, openLayers, overlay, unique } from "./support/helpers.ts";

setUpEmvbOnce();
test.use({ viewport: { width: 1440, height: 900 } });

const mediaLayout = {
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
};

test("W-740: media library retry retains keyboard focus through loading, empty and ready results", async ({
  page,
  request,
}) => {
  const id = await createPage(
    request,
    "Media library focus",
    mediaLayout,
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
      await expect(close).toBeFocused();
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
      await expect(opener).toBeFocused();
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

test("W-741: pending library dismissal returns to the URL until Choose is available", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  const id = await createPage(
    request,
    "Media dismissal focus",
    mediaLayout,
    `media-dismiss-focus-${unique()}`,
  );
  await page.route("**/emvb-library-*.png", (route) =>
    route.fulfill({ path: "e2e/fixtures/emvb-pixel.png", contentType: "image/png" }),
  );
  const release = Promise.withResolvers<void>();
  let lists = 0;
  await page.route("**/_emdash/api/media?*", async (route) => {
    lists += 1;
    await release.promise;
    await route.fulfill({ json: { data: { items: [] } } });
  });
  try {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await openEditor(page, id);
    await openLayers(page);
    await overlay(page).locator('[data-emvb-layer="img00001"] .emvb-layer-select').click();
    const opener = overlay(page).getByRole("button", { name: "Choose from library", exact: true });
    const url = overlay(page).getByLabel("Or paste a URL");
    const library = overlay(page).getByRole("dialog", { name: "Media library", exact: true });
    const close = library.getByRole("button", { name: "Close", exact: true });
    const image = canvas(page).locator('[data-emvb-id="img00001"]');
    const markup = await image.innerHTML();
    const frame = overlay(page).locator("iframe[data-emvb-canvas]");
    const frameWidth = await frame.evaluate((element) => element.getBoundingClientRect().width);
    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(library.getByRole("status")).toHaveText("Loading…");
    await expect(close).toBeFocused();
    await expect(opener).toBeDisabled();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.keyboard.press("Enter");
    await expect(library).toHaveCount(0);
    await expect(url).toBeFocused();
    await expect(url).toHaveValue("/emvb-library-original.png");
    await expect(opener).toBeDisabled();
    release.resolve();
    await expect(opener).toBeEnabled();
    await expect(url).toBeFocused();
    await page.screenshot({ path: `/tmp/emvb-media-dismiss-${test.info().project.name}-url.png` });
    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(library).toContainText("No images yet.");
    await expect(close).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(library).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(lists).toBe(2);
    await expect(url).toHaveValue("/emvb-library-original.png");
    expect(await image.innerHTML()).toBe(markup);
    expect(await frame.evaluate((element) => element.getBoundingClientRect().width)).toBe(
      frameWidth,
    );
  } finally {
    release.resolve();
  }
});

test("W-745: picking an image and closing the nested image editor keep keyboard focus", async ({
  page,
  request,
}) => {
  const id = await createPage(request, "Media pick focus", mediaLayout, `media-pick-${unique()}`);
  await page.route("**/emvb-library-*.png", (route) =>
    route.fulfill({ path: "e2e/fixtures/emvb-pixel.png", contentType: "image/png" }),
  );
  await page.route("**/_emdash/api/media?*", (route) =>
    route.fulfill({
      json: {
        data: {
          items: [
            {
              id: "pick-image",
              filename: "pick.png",
              url: "/emvb-library-choice.png",
              mimeType: "image/png",
              status: "ready",
              alt: "Pick image",
            },
          ],
        },
      },
    }),
  );
  await openEditor(page, id);
  await openLayers(page);
  await overlay(page).locator('[data-emvb-layer="img00001"] .emvb-layer-select').click();
  const opener = overlay(page).getByRole("button", { name: "Choose from library", exact: true });
  const library = overlay(page).getByRole("dialog", { name: "Media library", exact: true });
  const card = library.locator('[data-emvb-media-id="pick-image"]');
  const menu = library.getByRole("button", { name: "More for Pick image", exact: true });

  await opener.focus();
  await page.keyboard.press("Enter");
  await expect(card).toBeVisible();
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(library).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(overlay(page).getByLabel("Or paste a URL")).toHaveValue("/emvb-library-choice.png");
  await page.screenshot({ path: `/tmp/emvb-media-pick-${test.info().project.name}.png` });

  await page.keyboard.press("Enter");
  await expect(menu).toBeVisible();
  await menu.focus();
  await page.keyboard.press("Enter");
  const edit = page.getByRole("menuitem", { name: "Edit…" });
  await expect(edit).toBeVisible();
  await page.keyboard.press("Enter");
  const imageEditor = page.getByRole("dialog", { name: "Edit image", exact: true });
  await expect(imageEditor).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Escape");
  await expect(imageEditor).toHaveCount(0);
  await expect(library).toBeVisible();
  await expect(menu).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Edit…" }).click();
  await expect(page.locator("[data-emvb-image-editor]")).toHaveAttribute(
    "data-emvb-image-editor",
    "ready",
    { timeout: 30_000 },
  );
  const exposure = page.getByRole("textbox", { name: "Exposure value" });
  await exposure.fill("0.2");
  await exposure.press("Enter");
  await page.locator("[data-emvb-image-save]").click();
  await page.locator("[data-emvb-image-export-save]").click();
  await expect(imageEditor).toHaveCount(0, { timeout: 20_000 });
  await expect(library).toHaveCount(0);
  await expect(opener).toBeFocused();
});
