import { expect, test } from "@playwright/test";
import { createPage, setUpEmvbOnce } from "./support/api.ts";
import { canvas, openEditor, openLayers, overlay, unique } from "./support/helpers.ts";

setUpEmvbOnce();
test.use({ viewport: { width: 1440, height: 900 } });

for (const width of [1440, 1024]) {
  test(`W-738/W-739: icon upload feedback retains geometry (${width}px)`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const id = await createPage(
      request,
      "Icon upload feedback",
      {
        schemaVersion: 16,
        root: {
          id: "root0001",
          type: "container",
          props: {},
          children: [{ id: "icon0001", type: "icon", props: { iconId: "star", title: "Star" } }],
        },
      },
      `icon-upload-feedback-${unique()}`,
    );
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"></path></svg>';
    const file = { name: "feedback.svg", mimeType: "image/svg+xml", buffer: Buffer.from(svg) };
    const release = Promise.withResolvers<void>();
    let uploads = 0;
    await page.route("**/_emdash/api/plugins/emvb/icons", (route) =>
      route.fulfill({ json: { data: { items: [] } } }),
    );
    await page.route("**/_emdash/api/plugins/emvb/icons/upload", async (route) => {
      if (++uploads === 1) {
        await route.fulfill({
          status: 503,
          json: { error: { code: "BUSY", message: "Try saving again." } },
        });
      } else {
        await release.promise;
        await route.fulfill({
          json: {
            data: {
              item: {
                id: "aaaa000011112222",
                name: "Feedback icon",
                svg,
                uploadedAt: "2026-10-16T09:00:00Z",
              },
              imagesLeftOut: 0,
            },
          },
        });
      }
    });
    try {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await openEditor(page, id);
      await openLayers(page);
      await overlay(page).locator('[data-emvb-layer="icon0001"] .emvb-layer-select').click();
      const opener = overlay(page).locator("[data-emvb-icon-open]");
      const icon = canvas(page).locator('[data-emvb-id="icon0001"]');
      const markup = await icon.innerHTML();
      const frame = overlay(page).locator("iframe[data-emvb-canvas]");
      const frameWidth = await frame.evaluate((element) => element.getBoundingClientRect().width);
      await opener.click();
      const popup = page.getByRole("dialog", { name: "Icon library", exact: true });
      const picked = popup.locator("[data-emvb-icon-picked]");
      await expect(picked).toHaveAttribute("data-emvb-icon-picked", "lucide:star");
      await popup.locator('[data-emvb-icon-category="uploads"]').click();
      await expect(popup.locator(".emvb-icon-library-status")).toHaveText("No uploads yet.");
      const note = popup.locator("[data-emvb-icon-upload-note]");
      const input = popup.locator("[data-emvb-icon-upload-input]");
      const upload = popup.locator("[data-emvb-icon-upload-btn]");
      await expect(note).toHaveAttribute("aria-live", "polite");
      await expect(upload).toHaveAccessibleName("Upload SVG");
      await popup.evaluate(async (element) => {
        await Promise.all(element.getAnimations().map((animation) => animation.finished));
      });
      const measure = () =>
        popup.evaluate((element) => {
          const box = (selector: string) =>
            element.querySelector(selector)?.getBoundingClientRect().toJSON();
          return {
            button: box("[data-emvb-icon-upload-btn]"),
            toolbar: box(".emvb-icon-library-upload"),
            dialog: element.getBoundingClientRect().toJSON(),
          };
        });
      const geometry = await measure();
      await input.setInputFiles(file);
      await expect(note).toHaveText("Try saving again.");
      await expect(note).toHaveAttribute("role", "alert");
      await expect(note).toHaveAttribute("aria-live", "assertive");
      await expect(upload).toBeEnabled();
      expect(await measure()).toEqual(geometry);
      await expect(picked).toHaveAttribute("data-emvb-icon-picked", "lucide:star");

      await input.setInputFiles(file);
      await expect.poll(() => uploads).toBe(2);
      await expect(upload).toBeDisabled();
      await expect(upload).toHaveAccessibleName("Uploading…");
      await expect(upload.getByText("Uploading…", { exact: true })).toBeVisible();
      expect(await measure()).toEqual(geometry);
      await expect(note).toHaveAttribute("aria-live", "polite");
      await page.emulateMedia({ reducedMotion: "reduce" });
      expect(await measure()).toEqual(geometry);
      await page.screenshot({
        path: `/tmp/emvb-icon-upload-${test.info().project.name}-${width}-pending.png`,
      });
      release.resolve();
      await expect(note).toHaveText("Uploaded Feedback icon. Insert adds it to the page.");
      await expect(note).toHaveAttribute("role", "status");
      await expect(note).toHaveAttribute("aria-live", "polite");
      await expect(upload).toBeEnabled();
      await expect(upload).toHaveAccessibleName("Upload SVG");
      await expect(upload.getByText("Upload SVG", { exact: true })).toBeVisible();
      expect(await measure()).toEqual(geometry);
      await expect(picked).toHaveAttribute("data-emvb-icon-picked", "upload:aaaa000011112222");
      await page.screenshot({
        path: `/tmp/emvb-icon-upload-${test.info().project.name}-${width}-success.png`,
      });

      await input.setInputFiles(file);
      await expect(note).toContainText(
        "You already uploaded this SVG as Feedback icon, so it's selected.",
      );
      await expect(note).toHaveAttribute("role", "status");
      await expect(note).toHaveAttribute("aria-live", "polite");
      await expect(upload).toBeEnabled();
      expect(uploads).toBe(2);
      expect(await measure()).toEqual(geometry);
      await expect(popup.locator('[data-emvb-icon-id="upload:aaaa000011112222"]')).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await popup.getByRole("button", { name: "Close", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(popup).toHaveCount(0);
      await expect(opener).toBeFocused();
      expect(await icon.innerHTML()).toBe(markup);
      expect(await frame.evaluate((element) => element.getBoundingClientRect().width)).toBe(
        frameWidth,
      );
      await expect(overlay(page).locator("[data-emvb-icon-current]")).toHaveAttribute(
        "data-emvb-icon-current",
        "star",
      );
    } finally {
      release.resolve();
    }
  });
}
