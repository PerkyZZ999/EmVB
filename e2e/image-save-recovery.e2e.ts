import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
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

async function dialogMotion(popup: Locator) {
  return popup.evaluate((element) => {
    let backdrop: Element | undefined;
    for (
      let portal = element.closest("[data-base-ui-portal]");
      portal;
      portal = portal.parentElement?.closest("[data-base-ui-portal]") ?? null
    ) {
      backdrop = [...portal.children].find((child) => child.classList.contains("bg-kumo-recessed"));
      if (backdrop) break;
    }
    return {
      popup: getComputedStyle(element).transitionDuration,
      backdrop: backdrop ? getComputedStyle(backdrop).transitionDuration : "missing backdrop",
    };
  });
}

async function closeWithoutMotion(page: Page, popup: Locator) {
  const revived = popup.evaluate(
    (element) =>
      new Promise<string[]>((resolve) => {
        const failures: string[] = [];
        let backdrop: Element | undefined;
        for (
          let portal = element.closest("[data-base-ui-portal]");
          portal;
          portal = portal.parentElement?.closest("[data-base-ui-portal]") ?? null
        ) {
          backdrop = [...portal.children].find((child) =>
            child.classList.contains("bg-kumo-recessed"),
          );
          if (backdrop) break;
        }
        const observer = new MutationObserver(() => {
          if (!element.isConnected) {
            observer.disconnect();
            resolve(failures);
          } else if (element.hasAttribute("data-ending-style")) {
            for (const node of [element, backdrop]) {
              if (!node) continue;
              const duration = getComputedStyle(node).transitionDuration;
              if (duration !== "0s") failures.push(duration);
            }
          }
        });
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["data-ending-style"],
        });
        element.setAttribute("data-motion-observing", "true");
      }),
  );
  await expect(popup).toHaveAttribute("data-motion-observing", "true");
  await page.keyboard.press("Escape");
  expect(await revived).toEqual([]);
}

for (const preference of ["no-preference", "reduce"] as const) {
  test(`W-731: image export honors ${preference} motion through repeated opening and closing`, async ({
    page,
    request,
  }) => {
    await page.emulateMedia({ reducedMotion: preference });
    await openPhotoEditor(page, request, "Export motion");
    const editor = page.getByRole("dialog", { name: "Edit image", exact: true });
    expect(await dialogMotion(editor)).toEqual({
      popup: preference === "reduce" ? "0s" : "0.15s",
      backdrop: preference === "reduce" ? "0s" : "0.15s",
    });
    const save = page.locator("[data-emvb-image-save]");
    const canvas = page.locator("iframe[data-emvb-canvas]");
    const geometry = await canvas.evaluate((element) => element.getBoundingClientRect().toJSON());
    for (let round = 0; round < 2; round++) {
      await save.click();
      const popup = page.getByRole("dialog", { name: "Export image", exact: true });
      await expect(popup).toBeVisible();
      expect(await dialogMotion(popup)).toEqual({
        popup: preference === "reduce" ? "0s" : "0.15s",
        backdrop: preference === "reduce" ? "0s" : "0.15s",
      });
      const width = popup.getByRole("spinbutton", { name: "Width in pixels" });
      await expect(width).toHaveValue("640");
      await width.fill("320");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect.poll(() => dialogMotion(popup)).toEqual({ popup: "0s", backdrop: "0s" });
      await expect(width).toHaveValue("320");
      await page.screenshot({
        animations: "disabled",
        path: `/tmp/emvb-image-export-motion-${test.info().project.name}-${preference}-${round}.png`,
      });
      await closeWithoutMotion(page, popup);
      await expect(save).toBeFocused();
      await expect(page.locator("[data-emvb-image-editor]")).toHaveAttribute(
        "data-emvb-image-editor",
        "ready",
      );
      await page.emulateMedia({ reducedMotion: preference });
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await closeWithoutMotion(page, editor);
    await expect(overlay(page).locator("[data-emvb-image-edit]")).toBeFocused();
    expect(await canvas.evaluate((element) => element.getBoundingClientRect().toJSON())).toEqual(
      geometry,
    );
  });
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

test("W-718: an unsupported copy size gives a correction hint before upload and recovers at Full size", async ({
  page,
  request,
}) => {
  await openPhotoEditor(page, request, "Export validation");
  await page.locator("[data-emvb-image-save]").click();
  const form = page.locator("[data-emvb-image-export]");
  let uploads = 0;
  page.on("request", (sent) => {
    if (sent.method() === "POST" && new URL(sent.url()).pathname === "/_emdash/api/media")
      uploads++;
  });
  await form.getByRole("spinbutton", { name: "Width in pixels" }).fill("10001");
  await form.locator("[data-emvb-image-export-save]").click();
  await expect(form.getByRole("alert")).toContainText("between 16 and 10000 px");
  await expect(form.getByRole("alert")).toContainText("Full size");
  await expect(form.getByRole("button", { name: "Close", exact: true })).toBeEnabled();
  expect(uploads).toBe(0);
  await form.locator("[data-emvb-image-export-full]").click();
  await form.locator("[data-emvb-image-export-save]").click();
  await expect(page.locator("[data-emvb-image-editor]")).toHaveCount(0);
  await expect(overlay(page).locator("[data-emvb-image-edited]")).toBeVisible();
  expect(uploads).toBe(1);
});
