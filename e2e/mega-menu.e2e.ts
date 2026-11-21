import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  api,
  createPage,
  createThemePart,
  publishPage,
  publishThemePart,
  setUpEmvbOnce,
} from "./support/api.ts";
import { canvas, openEditor, openLayers, overlay, unique } from "./support/helpers.ts";

// W-1069: a Menu item opens a Section theme part as its dropdown panel (a mega menu).

setUpEmvbOnce();

/** A published Section part with a heading and a link, and a published page whose menu opens it. */
async function megaPage(request: APIRequestContext, tag: string) {
  const sectionId = await createThemePart(request, {
    title: `Mega ${tag}`,
    partType: "section",
    slug: `mega-${tag}`,
    layout: {
      schemaVersion: 18,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "mgah0001", type: "heading", props: { text: `Boots ${tag}`, level: 2 } },
          { id: "mgal0001", type: "link", props: { text: "All boots", href: "/boots" } },
        ],
      },
    },
  });
  await publishThemePart(request, sectionId);
  const slug = `mega-${tag}`;
  const layout = {
    schemaVersion: 18,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        {
          id: "menu0001",
          type: "menu",
          props: { direction: "row", label: "Primary" },
          children: [
            {
              id: "item0001",
              type: "menu-item",
              props: { text: "Products", panelPartId: sectionId, wide: true },
              children: [],
            },
            {
              id: "item0002",
              type: "menu-item",
              props: { text: "About", href: "/about" },
              children: [],
            },
            {
              id: "item0003",
              type: "menu-item",
              props: { text: "Gone", href: "/gone", panelPartId: "no-such-part" },
              children: [],
            },
          ],
        },
        { id: "head0001", type: "heading", props: { text: "Mega home", level: 1 } },
      ],
    },
  };
  const pageId = await createPage(request, `Mega ${tag}`, layout, slug);
  await publishPage(request, pageId);
  return { sectionId, pageId, slug };
}

const removePart = (request: APIRequestContext, id: string) =>
  api(request, "DELETE", `/_emdash/api/content/emvb_theme_parts/${id}`);

test("a mega panel opens by click, keyboard and hover, and Escape closes it (W-1069)", async ({
  page,
  request,
}) => {
  const tag = unique();
  const { sectionId, slug } = await megaPage(request, tag);
  try {
    await page.goto(`/${slug}`);
    const nav = page.getByRole("navigation", { name: "Primary" });
    const toggle = nav.locator("summary", { hasText: "Products" });
    const panel = nav.locator(".emvb-menu-panel--mega");
    const boots = panel.getByRole("heading", { name: `Boots ${tag}` });
    await expect(panel).toHaveCount(1);
    await expect(boots).toBeHidden();

    // Click (or tap) on the item's text.
    await toggle.click();
    await expect(boots).toBeVisible();
    await expect(panel.getByRole("link", { name: "All boots" })).toBeVisible();
    // The menu script: Escape closes it and focus returns to the toggle.
    await page.keyboard.press("Escape");
    await expect(boots).toBeHidden();
    await expect(toggle).toBeFocused();

    // Keyboard: Enter on the focused toggle opens it.
    await page.keyboard.press("Enter");
    await expect(boots).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(boots).toBeHidden();

    // Hover with a mouse shows it; moving away hides it.
    await page.mouse.move(0, 0);
    await toggle.hover();
    await expect(boots).toBeVisible();
    // Away from the menu and the panel (which covers the content under the menu).
    await page.mouse.move(640, 700);
    await expect(boots).toBeHidden();

    // A missing part leaves a plain link; the plain item is a link too.
    await expect(nav.getByRole("link", { name: "Gone" })).toHaveAttribute("href", "/gone");
    expect(await nav.locator("li", { hasText: "Gone" }).locator("details").count()).toBe(0);
  } finally {
    await removePart(request, sectionId);
  }
});

test("on a phone the mega panel opens inline under its item (W-1069)", async ({
  page,
  request,
}) => {
  const tag = unique();
  const { sectionId, slug } = await megaPage(request, tag);
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/${slug}`);
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.locator("summary", { hasText: "Products" }).click();
    const panel = nav.locator(".emvb-menu-panel--mega");
    await expect(panel.getByRole("heading", { name: `Boots ${tag}` })).toBeVisible();
    expect(await panel.evaluate((el) => getComputedStyle(el).position)).toBe("static");
    const box = await panel.boundingBox();
    const about = await nav.getByRole("link", { name: "About" }).boundingBox();
    if (!box || !about) throw new Error("no boxes");
    // Inside the screen, and the next item moved down below it.
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    expect(about.y).toBeGreaterThanOrEqual(box.y + box.height - 1);
  } finally {
    await removePart(request, sectionId);
  }
});

test("the editor picks the mega panel and previews it on the canvas (W-1069)", async ({
  page,
  request,
}) => {
  const tag = unique();
  const { sectionId, pageId } = await megaPage(request, tag);
  try {
    await openEditor(page, pageId, "Mega home");
    await openLayers(page);
    await overlay(page).locator('[data-emvb-layer="item0001"] .emvb-layer-select').click();
    await expect(overlay(page).locator("h2.emvb-panel-title")).toHaveText("Menu item");
    const field = overlay(page).locator('[data-emvb-mega-panel-bind="list"]');
    await expect(field).toContainText(`Mega ${tag}`);
    // Selecting the item opens its panel on the canvas.
    const heading = canvas(page).getByRole("heading", { name: `Boots ${tag}` });
    await expect(heading).toBeVisible();
    // A click inside the part selects the menu item that shows it, not the part's heading.
    await heading.click();
    await expect(overlay(page).locator("h2.emvb-panel-title")).toHaveText("Menu item");
  } finally {
    await removePart(request, sectionId);
  }
});
