import { expect, test, type Page } from "@playwright/test";
import { createPage, setUpEmvbOnce } from "./support/api.ts";
import { canvas, openEditor, overlay, unique } from "./support/helpers.ts";

setUpEmvbOnce();

const panel = (page: Page) => overlay(page).locator(".emvb-panel-right");
const scrollTop = (page: Page) => panel(page).evaluate((el) => el.scrollTop);
const pick = (page: Page, id: string) => canvas(page).locator(`[data-emvb-id="${id}"]`).click();

test("the settings panel keeps the scroll position of each tab across selections and menus (W-152)", async ({
  page,
  request,
}) => {
  const id = await createPage(
    request,
    "Panel scroll",
    {
      schemaVersion: 12,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "head0001", type: "heading", props: { text: "Panel scroll", level: 1 } },
          { id: "boxa0001", type: "div-block", props: {}, children: [] },
          { id: "boxb0001", type: "div-block", props: {}, children: [] },
        ],
      },
    },
    `panel-scroll-${unique()}`,
  );
  await openEditor(page, id, "Panel scroll");
  await pick(page, "boxa0001");
  await expect(overlay(page).getByRole("tab", { name: "Style" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const closed = panel(page).locator('button[data-emvb-section][aria-expanded="false"]');
  while ((await closed.count()) > 0) await closed.first().click();
  await panel(page).evaluate((el) => {
    el.scrollTop = 600;
  });
  await expect.poll(() => scrollTop(page)).toBe(600);

  // Opening and closing a menu leaves the panel where it was.
  const unit = panel(page).locator(".emvb-unit-btn").filter({ visible: true });
  for (const button of await unit.all()) {
    const box = await button.boundingBox();
    if (!box || box.y < 200 || box.y > 600) continue;
    await button.click();
    await expect(page.locator("[data-emvb-unit-menu]")).toBeVisible();
    expect(await scrollTop(page)).toBe(600);
    await page.keyboard.press("Escape");
    break;
  }
  expect(await scrollTop(page)).toBe(600);

  // The Heading opens on Content, at the top; the next Div Block's Style is back at 600.
  await pick(page, "head0001");
  await expect(overlay(page).getByRole("tab", { name: "Content" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect.poll(() => scrollTop(page)).toBe(0);
  await pick(page, "boxb0001");
  await expect.poll(() => scrollTop(page)).toBe(600);
});
