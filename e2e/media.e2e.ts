import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { canvas, openEditor, openLayers, overlay, saveDraft, unique } from "./support/helpers.ts";

const PIXEL = path.join(process.cwd(), "e2e/fixtures/emvb-pixel.png");

const imageLayout = () => ({
  schemaVersion: 16,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
    children: [
      {
        id: "img00001",
        type: "image",
        props: { src: "", alt: "Image", decorative: false },
      },
    ],
  },
});

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

async function selectImage(page: Page) {
  // Empty-src images are a zero-size span until the canvas CSS kicks in — Layers is reliable.
  await openLayers(page);
  await overlay(page).locator(".emvb-layer-select", { hasText: "Image" }).click();
  await expect(overlay(page).locator(".emvb-overlay-label")).toContainText("Image");
  await expect(overlay(page).locator("[data-emvb-media-picker]")).toBeVisible();
}

async function uploadPixel(page: Page) {
  await overlay(page).locator("[data-emvb-media-upload]").setInputFiles(PIXEL);
  await expect(overlay(page).locator(".emvb-media-thumb")).toBeVisible({ timeout: 20_000 });
}

test("W-713: a failed media library load can be retried without changing the image", async ({
  page,
  request,
}) => {
  const id = await createPage(request, "Media retry", imageLayout(), `media-retry-${unique()}`);
  await openEditor(page, id);
  await selectImage(page);
  await uploadPixel(page);
  const source = await overlay(page).getByLabel("Or paste a URL").inputValue();
  let attempts = 0;
  await page.route("**/_emdash/api/media?*", async (route) => {
    if (route.request().method() === "GET" && ++attempts === 1) {
      await route.fulfill({
        status: 503,
        json: { error: { message: "Library temporarily unavailable." } },
      });
    } else await route.continue();
  });
  await overlay(page).getByRole("button", { name: "Choose from library", exact: true }).click();
  const library = overlay(page).getByRole("dialog", { name: "Media library", exact: true });
  await expect(library.getByRole("alert")).toContainText("Library temporarily unavailable.");
  await expect(library).not.toContainText("No images yet.");
  await expect(overlay(page).getByLabel("Or paste a URL")).not.toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(overlay(page).getByLabel("Or paste a URL")).toHaveValue(source);
  await library.getByRole("button", { name: "Retry", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(library.locator("[data-emvb-media-id]").first()).toBeVisible();
  await expect(library.getByRole("alert")).toHaveCount(0);
  expect(attempts).toBe(2);
  await expect(overlay(page).getByLabel("Or paste a URL")).toHaveValue(source);
  const card = library.locator("[data-emvb-media-id]").first();
  const pickedSource = await card.locator("img").getAttribute("src");
  await card.click();
  await expect(library).toHaveCount(0);
  await expect(overlay(page).getByLabel("Or paste a URL")).toHaveValue(pickedSource ?? "");
});

test("upload stores media id, URL, alt, and dimensions on both platforms", async ({
  page,
  request,
}) => {
  const id = await createPage(request, "Media upload", imageLayout(), `media-up-${unique()}`);
  await openEditor(page, id);
  await selectImage(page);

  await uploadPixel(page);
  await expect(overlay(page).getByLabel("Or paste a URL")).toHaveValue(
    /\/_emdash\/api\/media\/file\//,
  );

  await saveDraft(page);

  const layout = await storedLayout<{
    root: {
      children: Array<{
        type: string;
        props: {
          src?: string;
          alt?: string;
          mediaId?: string;
          width?: number;
          height?: number;
        };
      }>;
    };
  }>(request, id);
  const image = layout.root.children[0];
  expect(image?.type).toBe("image");
  expect(image?.props.src).toMatch(/^\/_emdash\/api\/media\/file\//);
  // The layout starts with the placeholder alt "Image"; an upload replaces it with the library
  // item's alt, or the file name when it has none. EmDash 1.2 stores the alt sent with an upload,
  // and the pixel deduplicates to the item the a11y and success specs upload with alt "Hero".
  const mediaResponse = await request.get(`/_emdash/api/media/${image?.props.mediaId ?? ""}`);
  expect(mediaResponse.ok()).toBe(true);
  const libraryAlt = ((await mediaResponse.json()) as { data?: { item?: { alt?: string | null } } })
    .data?.item?.alt;
  const expectedAlt = libraryAlt || "emvb-pixel";
  expect(image?.props.alt).toBe(expectedAlt);
  expect(image?.props.width).toBe(1);
  expect(image?.props.height).toBe(1);

  await expect(
    canvas(page).locator('img.emvb-image[src*="/_emdash/api/media/file/"]'),
  ).toHaveAttribute("alt", expectedAlt);

  // The stored media id names a real library item with the stored URL.
  const mediaId = image?.props.mediaId ?? "";
  expect(mediaId).not.toBe("");
  await overlay(page).locator("[data-emvb-media-library]").click();
  const card = overlay(page).locator(`[data-emvb-media-id="${mediaId}"]`);
  await expect(card).toHaveCount(1);
  await expect(card.locator("img")).toHaveAttribute("src", image?.props.src ?? "");
});

test("library picker reapplies a previously uploaded image", async ({ page, request }) => {
  const id = await createPage(request, "Media pick", imageLayout(), `media-pick-${unique()}`);
  await openEditor(page, id);
  await selectImage(page);

  // Ensure the library has at least one image.
  await uploadPixel(page);

  // Clear via URL field then re-pick from the library dialog.
  await overlay(page).getByLabel("Or paste a URL").fill("https://example.com/cleared.jpg");
  await overlay(page).getByLabel("Or paste a URL").blur();
  await expect(overlay(page).getByLabel("Or paste a URL")).toHaveValue(
    "https://example.com/cleared.jpg",
  );

  await overlay(page).locator("[data-emvb-media-library]").click();
  await expect(overlay(page).locator("[data-emvb-media-dialog]")).toBeVisible();
  const picked = overlay(page).locator("[data-emvb-media-id]").first();
  const pickedId = await picked.getAttribute("data-emvb-media-id");
  const pickedSrc = await picked.locator("img").getAttribute("src");
  expect(pickedId).not.toBeNull();
  await picked.click();
  await expect(overlay(page).locator("[data-emvb-media-dialog]")).toHaveCount(0);
  await expect(overlay(page).getByLabel("Or paste a URL")).toHaveValue(
    /\/_emdash\/api\/media\/file\//,
  );

  await saveDraft(page);

  const layout = await storedLayout<{
    root: { children: Array<{ props: { src?: string; mediaId?: string } }> };
  }>(request, id);
  // The picked library item's id and URL are stored, replacing the pasted URL.
  expect(layout.root.children[0]?.props.mediaId).toBe(pickedId ?? "");
  expect(layout.root.children[0]?.props.src).toBe(pickedSrc ?? "");
  expect(layout.root.children[0]?.props.src).toMatch(/^\/_emdash\/api\/media\/file\//);
});
