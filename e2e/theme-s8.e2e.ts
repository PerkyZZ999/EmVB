import { expect, test } from "@playwright/test";
import { createPage, createThemePart, setUpEmvbOnce } from "./support/api.ts";
import { canvas, openEditor, overlay, unique } from "./support/helpers.ts";

const THEME = "/_emdash/admin/plugins/emvb/theme";

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

test("Theme Builder creates a Header and opens the theme-part editor", async ({ page }) => {
  const title = `Header ${unique()}`;
  await page.goto(THEME);
  await expect(page.locator('[data-emvb-page="theme"]')).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "New theme part" }).click();
  await expect(page.locator('[data-emvb-dialog="new-theme-part"]')).toBeVisible();
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page).toHaveURL(/\/editor\?entry=.*collection=emvb_theme_parts/, {
    timeout: 20_000,
  });
  await expect(overlay(page).locator(".emvb-topbar-title")).toBeVisible({ timeout: 20_000 });
  await expect(canvas(page).getByRole("heading", { name: title })).toBeVisible();
});

test("S8 Add panel exposes Flexbox, Div Block, SVG, and Tabs", async ({ page, request }) => {
  const id = await createPage(
    request,
    "S8 tiles",
    {
      schemaVersion: 6,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
        children: [{ id: "head0001", type: "heading", props: { text: "S8", level: 1 } }],
      },
    },
    `s8-${unique()}`,
  );
  await openEditor(page, id, "S8");
  for (const tile of ["flexbox", "div-block", "svg", "tabs"] as const) {
    await expect(overlay(page).locator(`[data-emvb-add-tile="${tile}"]`)).toBeVisible();
  }
});

test("Site styles Classes Manager tab is reachable", async ({ page, request }) => {
  const id = await createPage(
    request,
    "Classes manager",
    {
      schemaVersion: 6,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
        children: [{ id: "head0001", type: "heading", props: { text: "Classes", level: 1 } }],
      },
    },
    `cls-${unique()}`,
  );
  await openEditor(page, id);
  await overlay(page).getByRole("button", { name: "Site styles" }).click();
  await expect(overlay(page).locator("[data-emvb-site-styles]")).toBeVisible();
  await overlay(page).getByRole("tab", { name: "Classes" }).click();
  await expect(overlay(page).locator('[data-emvb-site-tab="classes"]')).toBeVisible();
  await expect(overlay(page).locator("[data-emvb-classes]")).toBeVisible();
});

test("API-created Popup theme part loads in the editor with Triggers", async ({
  page,
  request,
}) => {
  const title = `Popup ${unique()}`;
  const id = await createThemePart(request, {
    title,
    partType: "popup",
    slug: `popup-${unique()}`,
  });
  await openEditor(page, id, title, "emvb_theme_parts");
  // Clear selection so theme-part settings (Triggers) appear in the right panel.
  await page.keyboard.press("Escape");
  await expect(overlay(page).locator('[data-emvb-panel="theme-part-settings"]')).toBeVisible({
    timeout: 10_000,
  });
  await expect(overlay(page).locator('[data-emvb-panel="triggers"]')).toBeVisible();
});
