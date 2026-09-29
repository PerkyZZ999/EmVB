import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createPage, getPage, parsed, setUpEmvbOnce } from "./support/api.ts";
import { canvas, openEditor, openLayers, overlay, saveStatus, unique } from "./support/helpers.ts";

const PIXEL = path.join(process.cwd(), "e2e/fixtures/emvb-pixel.png");

const imageLayout = () => ({
  schemaVersion: 1,
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

test("upload stores media id, URL, alt, and dimensions on both platforms", async ({
  page,
  request,
}) => {
  const id = await createPage(request, "Media upload", imageLayout(), `media-up-${unique()}`);
  await openEditor(page, id);
  await selectImage(page);

  await overlay(page).locator("[data-emvb-media-upload]").setInputFiles(PIXEL);
  await expect(overlay(page).locator(".emvb-media-thumb")).toBeVisible({ timeout: 20_000 });
  await expect(overlay(page).getByLabel("Or paste a URL")).toHaveValue(
    /\/_emdash\/api\/media\/file\//,
  );

  await overlay(page)
    .getByRole("button", { name: /Save draft/ })
    .click();
  await expect(saveStatus(page)).toContainText("Saved", { timeout: 15_000 });

  const layout = parsed((await getPage(request, id)).data["layout"]) as {
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
  };
  const image = layout.root.children[0];
  expect(image?.type).toBe("image");
  expect(image?.props.mediaId).toBeTruthy();
  expect(image?.props.src).toMatch(/^\/_emdash\/api\/media\/file\//);
  expect(image?.props.alt).toBeTruthy();
  expect(image?.props.width).toBe(1);
  expect(image?.props.height).toBe(1);

  await expect(
    canvas(page).locator('img.emvb-image[src*="/_emdash/api/media/file/"]'),
  ).toBeVisible();
});

test("library picker reapplies a previously uploaded image", async ({ page, request }) => {
  const id = await createPage(request, "Media pick", imageLayout(), `media-pick-${unique()}`);
  await openEditor(page, id);
  await selectImage(page);

  // Ensure the library has at least one image.
  await overlay(page).locator("[data-emvb-media-upload]").setInputFiles(PIXEL);
  await expect(overlay(page).locator(".emvb-media-thumb")).toBeVisible({ timeout: 20_000 });
  const firstSrc = await overlay(page).getByLabel("Or paste a URL").inputValue();

  // Clear via URL field then re-pick from the library dialog.
  await overlay(page).getByLabel("Or paste a URL").fill("https://example.com/cleared.jpg");
  await overlay(page).getByLabel("Or paste a URL").blur();
  await expect(overlay(page).getByLabel("Or paste a URL")).toHaveValue(
    "https://example.com/cleared.jpg",
  );

  await overlay(page).locator("[data-emvb-media-library]").click();
  await expect(overlay(page).locator("[data-emvb-media-dialog]")).toBeVisible();
  await overlay(page).locator("[data-emvb-media-id]").first().click();
  await expect(overlay(page).locator("[data-emvb-media-dialog]")).toHaveCount(0);
  await expect(overlay(page).getByLabel("Or paste a URL")).toHaveValue(
    /\/_emdash\/api\/media\/file\//,
  );

  await overlay(page)
    .getByRole("button", { name: /Save draft/ })
    .click();
  await expect(saveStatus(page)).toContainText("Saved", { timeout: 15_000 });

  const layout = parsed((await getPage(request, id)).data["layout"]) as {
    root: { children: Array<{ props: { src?: string; mediaId?: string } }> };
  };
  expect(layout.root.children[0]?.props.mediaId).toBeTruthy();
  expect(layout.root.children[0]?.props.src).toMatch(/^\/_emdash\/api\/media\/file\//);
  // Re-pick may resolve the same file (dedupe) — just ensure we left the pasted URL behind.
  expect(layout.root.children[0]?.props.src).not.toBe("https://example.com/cleared.jpg");
  void firstSrc;
});
