import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createPage, setUpEmvbOnce } from "./support/api.ts";
import { openEditor, openLayers, overlay, unique } from "./support/helpers.ts";

setUpEmvbOnce();
test.use({ viewport: { width: 1440, height: 900 } });

async function openPhotoEditor(page: Page, request: APIRequestContext, title: string) {
  const upload = await request.post("/_emdash/api/media", {
    headers: { "X-EmDash-Request": "1" },
    multipart: {
      file: {
        name: "garden.jpg",
        mimeType: "image/jpeg",
        buffer: readFileSync("e2e/fixtures/photo-gps.jpg"),
      },
      width: "640",
      height: "480",
    },
  });
  expect(upload.status()).toBeLessThan(300);
  const media = ((await upload.json()) as { data: { item: { id: string; url: string } } }).data
    .item;
  const id = await createPage(
    request,
    title,
    {
      schemaVersion: 16,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "image001",
            type: "image",
            props: { src: media.url, mediaId: media.id, alt: "Image", width: 640, height: 480 },
          },
        ],
      },
    },
    `export-${unique()}`,
  );
  await openEditor(page, id);
  await openLayers(page);
  await overlay(page).locator(".emvb-layer-select", { hasText: "Image" }).click();
  await overlay(page).locator("[data-emvb-image-edit]").click();
  await expect(page.locator("[data-emvb-image-editor]")).toHaveAttribute(
    "data-emvb-image-editor",
    "ready",
    { timeout: 30_000 },
  );
}

test("W-716: Escape keeps an image save open so a failed upload can be retried", async ({
  page,
  request,
}) => {
  await openPhotoEditor(page, request, "Export recovery");
  await page.locator("[data-emvb-image-save]").click();
  const form = page.locator("[data-emvb-image-export]");
  const release = Promise.withResolvers<void>();
  let attempts = 0;
  await page.route("**/_emdash/api/media", async (route) => {
    if (route.request().method() === "POST" && ++attempts === 1) {
      await release.promise;
      await route.fulfill({
        status: 503,
        json: { error: { message: "Temporary upload failure" } },
      });
    } else await route.continue();
  });
  try {
    await form.locator("[data-emvb-image-export-save]").click();
    await expect.poll(() => attempts).toBe(1);
    await expect(form.getByRole("button", { name: "Close", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(form).toBeVisible();
    release.resolve();
    await expect(form.getByRole("alert")).toContainText("Temporary upload failure");
    await expect(form.getByRole("button", { name: "Close", exact: true })).toBeEnabled();
    await form.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.locator("[data-emvb-image-editor]")).toHaveCount(0);
    expect(attempts).toBe(2);
    await expect(overlay(page).locator("[data-emvb-image-edited]")).toBeVisible();
  } finally {
    release.resolve();
  }
});

test("W-717: portrait export dimensions honor both side limits without rendering a large image", async ({
  page,
  request,
}) => {
  await openPhotoEditor(page, request, "Export dimensions");
  await page.locator('[data-emvb-image-tool="compose"]').click();
  await page.locator('[data-emvb-image-rotate="right"]').click();
  await expect(page.locator("[data-emvb-image-editor-file]")).toContainText("480 × 640 px");
  await page.locator("[data-emvb-image-save]").click();
  const form = page.locator("[data-emvb-image-export]");
  const width = form.getByRole("spinbutton", { name: "Width in pixels" });
  const height = form.getByRole("spinbutton", { name: "Height in pixels" });
  await expect(width).toHaveAttribute("max", "12288");
  await expect(height).toHaveAttribute("max", "16384");
  await width.fill("16384");
  await expect(width).toHaveValue("12288");
  await expect(height).toHaveValue("16384");
  await form.locator("[data-emvb-image-export-full]").click();
  await expect(width).toHaveValue("480");
  await expect(height).toHaveValue("640");
  await height.fill("16384");
  await expect(width).toHaveValue("12288");
  await expect(height).toHaveValue("16384");
  await form.getByRole("button", { name: "Close", exact: true }).click();
  await expect(form).toHaveCount(0);
});
