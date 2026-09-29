import type { FrameLocator, Locator, Page } from "@playwright/test";

/** Unique-ish slug/title suffix so specs can run in any order on a shared database. */
export const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** The EmVB editor overlay over the admin. */
export const overlay = (page: Page): Locator => page.locator("[data-emvb-editor]");

/** The sandboxed editor canvas iframe. */
export const canvas = (page: Page): FrameLocator => page.frameLocator("iframe[data-emvb-canvas]");
