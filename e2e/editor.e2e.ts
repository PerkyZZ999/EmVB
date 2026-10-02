import { expect, test, type Page } from "@playwright/test";
import { createPage, ensureEmvbSetup } from "./support/api.ts";
import { EDITOR, overlay } from "./support/helpers.ts";

const LAYOUT = {
  schemaVersion: 8,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "row", gap: { value: 16, unit: "px" } },
    children: [{ id: "head0001", type: "heading", props: { text: "Canvas heading", level: 1 } }],
  },
};

test.describe.configure({ mode: "serial" });

let entry: string;
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: test.info().project.use.storageState });
  const page = await context.newPage();
  await ensureEmvbSetup(page);
  entry = await createPage(context.request, "Layering check", LAYOUT);
  await context.close();
});

const inOverlay = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([px, py]) => Boolean(document.elementFromPoint(px, py)?.closest("[data-emvb-editor]")),
    [x, y] as const,
  );
/** True when the element at the centre of `selector`'s box belongs to it (it would get the click). */
const receivesCentreClick = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const target = document.querySelector(sel);
    if (!target) return "missing";
    const box = target.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return Boolean(hit && target.contains(hit));
  }, selector);

async function openEditor(page: Page) {
  await page.goto(`${EDITOR}?entry=${entry}`);
  await expect(overlay(page)).toBeVisible({ timeout: 20_000 });
  const canvas = page.frameLocator("iframe[data-emvb-canvas]");
  await expect(canvas.getByRole("heading", { name: "Canvas heading" })).toBeVisible();
}

// Canvas width is the viewport minus the DESIGN.md panel tokens (panel-left 256 + panel-right 288,
// denser chrome since d32ca75).
for (const [width, height, canvasWidth] of [
  [1280, 720, 736],
  [1920, 1080, 1376],
] as const) {
  test(`at ${width}×${height} the overlay covers the admin and the canvas gets the real width between the panels`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await openEditor(page);
    expect(await inOverlay(page, 40, Math.round(height / 2))).toBe(true);
    expect(await inOverlay(page, Math.round(width / 2), 20)).toBe(true);
    expect(await inOverlay(page, width - 10, height - 10)).toBe(true);

    const frame = page.locator("iframe[data-emvb-canvas]");
    await expect(frame).toHaveAttribute("sandbox", "allow-same-origin");
    const sizes = await frame.evaluate((el: HTMLIFrameElement) => ({
      box: el.getBoundingClientRect().width,
      inner: el.contentDocument?.documentElement.clientWidth ?? -1,
      transform: getComputedStyle(el).transform,
      zoom: getComputedStyle(el).zoom,
    }));
    expect(sizes).toEqual({ box: canvasWidth, inner: canvasWidth, transform: "none", zoom: "1" });
    // The page's own CSS reaches the canvas: the container is a row with a 16 px gap.
    const rootStyle = await frame.evaluate((el: HTMLIFrameElement) => {
      const node = el.contentDocument?.querySelector(".emvb-root");
      const style = node ? el.contentWindow?.getComputedStyle(node) : undefined;
      return { direction: style?.flexDirection, gap: style?.columnGap };
    });
    expect(rootStyle).toEqual({ direction: "row", gap: "16px" });
  });
}

test("a Kumo dialog opened from the editor stacks above it and takes the click", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openEditor(page);
  await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();
  expect(await receivesCentreClick(page, '[role="dialog"]')).toBe(true);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});

test("Ctrl+K doesn't open the host command palette while the editor is open", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openEditor(page);
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(500);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("with the Ctrl+K block turned off, the host palette stacks above the editor and takes the click", async ({
  page,
}) => {
  // Test-only: skip window capture keydown listeners, which is where EmVB's block lives.
  await page.addInitScript(() => {
    const add = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      const capture = options === true || (typeof options === "object" && options?.capture);
      if (this === window && type === "keydown" && capture) return;
      add.call(this, type, listener, options);
    };
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await openEditor(page);
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog");
  await expect(palette).toBeVisible();
  expect(await receivesCentreClick(page, '[role="dialog"]')).toBe(true);
  await palette.getByRole("combobox").or(palette.getByRole("textbox")).first().click();
});

test("below 1024 px the small-screen notice replaces the editor", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto(`${EDITOR}?entry=${entry}`);
  await expect(page.getByText("EmVB needs a larger screen")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("iframe[data-emvb-canvas]")).toHaveCount(0);
  expect(await inOverlay(page, 40, 350)).toBe(true);
});

test("an unknown entry shows Page not found inside the editor", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${EDITOR}?entry=01NOSUCHPAGE000000000000`);
  await expect(overlay(page).getByText("Page not found")).toBeVisible({ timeout: 20_000 });
});
