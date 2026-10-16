import { expect, test } from "@playwright/test";
import { createPage, setUpEmvbOnce } from "./support/api.ts";
import { canvas, openEditor, openLayers, overlay, unique } from "./support/helpers.ts";

setUpEmvbOnce();
test.use({ viewport: { width: 1440, height: 900 } });

test("W-738: icon upload failure, retry and duplicate selection expose live feedback", async ({
  page,
  request,
}) => {
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
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1h2"></path></svg>';
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
    await input.setInputFiles(file);
    await expect(note).toHaveText("Try saving again.");
    await expect(note).toHaveAttribute("role", "alert");
    await expect(note).toHaveAttribute("aria-live", "assertive");
    await expect(upload).toBeEnabled();
    await expect(picked).toHaveAttribute("data-emvb-icon-picked", "lucide:star");

    await input.setInputFiles(file);
    await expect.poll(() => uploads).toBe(2);
    await expect(upload).toBeDisabled();
    await expect(upload).toHaveText("Uploading…");
    await expect(note).toHaveAttribute("aria-live", "polite");
    await page.emulateMedia({ reducedMotion: "reduce" });
    release.resolve();
    await expect(note).toHaveText("Uploaded Feedback icon. Insert adds it to the page.");
    await expect(note).toHaveAttribute("role", "status");
    await expect(note).toHaveAttribute("aria-live", "polite");
    await expect(upload).toBeEnabled();
    await expect(picked).toHaveAttribute("data-emvb-icon-picked", "upload:aaaa000011112222");
    await page.screenshot({
      path: `/tmp/emvb-icon-upload-${test.info().project.name}-success.png`,
    });

    await input.setInputFiles(file);
    await expect(note).toContainText(
      "You already uploaded this SVG as Feedback icon, so it's selected.",
    );
    await expect(note).toHaveAttribute("role", "status");
    await expect(note).toHaveAttribute("aria-live", "polite");
    await expect(upload).toBeEnabled();
    expect(uploads).toBe(2);
    await expect(popup.locator('[data-emvb-icon-id="upload:aaaa000011112222"]')).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await popup.getByRole("button", { name: "Close", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(popup).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await icon.innerHTML()).toBe(markup);
    await expect(overlay(page).locator("[data-emvb-icon-current]")).toHaveAttribute(
      "data-emvb-icon-current",
      "star",
    );
  } finally {
    release.resolve();
  }
});
