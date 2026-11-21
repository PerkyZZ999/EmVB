import { expect, type FrameLocator, type Locator, type Page } from "@playwright/test";

/** Unique-ish slug/title suffix so specs can run in any order on a shared database. */
export const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** The EmVB editor overlay over the admin. */
export const overlay = (page: Page): Locator => page.locator("[data-emvb-editor]");

/** The sandboxed editor canvas iframe. */
export const canvas = (page: Page): FrameLocator => page.frameLocator("iframe[data-emvb-canvas]");

export const EDITOR = "/_emdash/admin/plugins/emvb/editor";

export const saveStatus = (page: Page): Locator => overlay(page).locator(".emvb-save-status");

/** Clicks Save draft and waits for the save to land. */
export async function saveDraft(page: Page) {
  await overlay(page)
    .getByRole("button", { name: /Save draft/ })
    .click();
  await expect(saveStatus(page)).toContainText("Saved", { timeout: 15_000 });
}

/** Publishes the style draft from Site styles, as a user does (W-100). */
export async function publishSiteStyles(page: Page) {
  await overlay(page).getByRole("button", { name: "Site styles", exact: true }).click();
  const publish = overlay(page).getByRole("button", { name: "Publish styles" });
  await publish.click();
  await expect(publish).toHaveCount(0);
}

/** Opens `id` in the editor and waits for its top bar, and for `heading` on the canvas if given. */
export async function openEditor(page: Page, id: string, heading?: string, collection?: string) {
  await page.goto(`${EDITOR}?entry=${id}${collection ? `&collection=${collection}` : ""}`);
  await expect(overlay(page).locator(".emvb-topbar-title")).toBeVisible({ timeout: 20_000 });
  if (heading) await expect(canvas(page).getByRole("heading", { name: heading })).toBeVisible();
}

/**
 * W-1094: switches the system colour scheme and waits for the admin to follow it. EmDash's theme
 * provider hears the media change and only then sets `<html data-mode>`, a moment later (seconds
 * on a slow CI runner), so colours read right after `emulateMedia` can still be the old scheme's.
 */
export async function emulateAdminColorScheme(page: Page, colorScheme: "light" | "dark") {
  await page.emulateMedia({ colorScheme });
  await expect(page.locator("html")).toHaveAttribute("data-mode", colorScheme);
}

/**
 * W-1094: waits until no CSS transition is running, so computed colours are final. Kumo fades
 * colours on a light/dark switch; halfway, text and its background are both mid-grey, and an axe
 * scan then reports color-contrast that no one ever sees once the switch is done.
 */
export async function colorsSettled(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter((a) => a instanceof CSSTransition && a.playState === "running").length,
      ),
    )
    .toBe(0);
}

/** W-1094: the admin in `colorScheme`, with its colour transitions done (for axe and colour checks). */
export async function settleAdminColorScheme(page: Page, colorScheme: "light" | "dark") {
  await emulateAdminColorScheme(page, colorScheme);
  await colorsSettled(page);
}

export async function openLayers(page: Page) {
  if ((await overlay(page).locator('[data-emvb-panel="layers"]').count()) > 0) return;
  await overlay(page).getByRole("tab", { name: "Layers" }).click();
}
