import { expect, type FrameLocator, type Locator, type Page } from "@playwright/test";

/** Unique-ish slug/title suffix so specs can run in any order on a shared database. */
export const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** The EmVB editor overlay over the admin. */
export const overlay = (page: Page): Locator => page.locator("[data-emvb-editor]");

/** The sandboxed editor canvas iframe. */
export const canvas = (page: Page): FrameLocator => page.frameLocator("iframe[data-emvb-canvas]");

export const EDITOR = "/_emdash/admin/plugins/emvb/editor";

export const saveStatus = (page: Page): Locator => overlay(page).locator(".emvb-save-status");

/** Opens `id` in the editor and waits for its top bar, and for `heading` on the canvas if given. */
export async function openEditor(page: Page, id: string, heading?: string, collection?: string) {
  await page.goto(`${EDITOR}?entry=${id}${collection ? `&collection=${collection}` : ""}`);
  await expect(overlay(page).locator(".emvb-topbar-title")).toBeVisible({ timeout: 20_000 });
  if (heading) await expect(canvas(page).getByRole("heading", { name: heading })).toBeVisible();
}

export async function openLayers(page: Page) {
  if ((await overlay(page).locator('[data-emvb-panel="layers"]').count()) > 0) return;
  await overlay(page).getByRole("tab", { name: "Layers" }).click();
}
