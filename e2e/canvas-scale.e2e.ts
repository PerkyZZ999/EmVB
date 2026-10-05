import { expect, test } from "@playwright/test";
import { createPage, setUpEmvbOnce } from "./support/api.ts";
import { canvas, openEditor, overlay, unique } from "./support/helpers.ts";

setUpEmvbOnce();

const layoutFor = (text: string) => ({
  schemaVersion: 11,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "head0001", type: "heading", props: { text, level: 1 } },
      { id: "text0001", type: "text", props: { text: "Second element" } },
    ],
  },
});

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(2);

test("the Desktop canvas lays the page out at 1280 px and scales it to fit, with clicks and the selection outline where the element is (W-158)", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  const text = `Scaled ${unique()}`;
  const id = await createPage(request, text, layoutFor(text), `scale-${unique()}`);
  await openEditor(page, id, text);

  const frame = page.locator("iframe[data-emvb-canvas]");
  const pageWidth = () =>
    canvas(page)
      .locator("body")
      .evaluate(() => window.innerWidth);
  expect(await pageWidth()).toBe(1280);
  const stage = page.locator(".emvb-stage-frame");
  const scale = Number(await stage.getAttribute("data-emvb-canvas-scale"));
  expect(scale).toBeLessThan(1);
  near((await frame.boundingBox())?.width ?? 0, 1280 * scale);
  const zoom = overlay(page).getByRole("button", { name: /^Fit to canvas/ });
  await expect(zoom).toHaveText(`Fit · ${Math.round(scale * 100)}%`);
  await expect(zoom).toHaveAttribute("aria-pressed", "true");

  // A real click on the scaled second element selects it, and the outline covers it on screen.
  const second = canvas(page).getByText("Second element");
  const box = await second.boundingBox();
  if (!box) throw new Error("no box");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(overlay(page).locator(".emvb-panel-title")).toHaveText("Text");
  const outline = await overlay(page).locator('[data-emvb-selected="text0001"]').boundingBox();
  if (!outline) throw new Error("no outline");
  near(outline.x, box.x);
  near(outline.y, box.y);
  near(outline.width, box.width);
  near(outline.height, box.height);

  // 100%: no scaling, and the stage scrolls sideways to reach the rest of the page.
  await zoom.click();
  await expect(zoom).toHaveText("100%");
  await expect(stage).toHaveAttribute("data-emvb-canvas-scale", "1");
  near((await frame.boundingBox())?.width ?? 0, 1280);
  const scrolls = await page
    .locator(".emvb-stage")
    .evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(scrolls).toBe(true);
  await zoom.click();
  await expect(zoom).toHaveText(/^Fit · /);

  // Tablet lays out at 768 (scaled only when the stage is narrower), Mobile at 390.
  await page.getByRole("tab", { name: "Tablet" }).click();
  await expect.poll(pageWidth).toBe(768);
  await page.getByRole("tab", { name: "Mobile" }).click();
  await expect.poll(pageWidth).toBe(390);
  await expect(stage).toHaveAttribute("data-emvb-canvas-scale", "1");
});

test("Preview opens a Mobile or Tablet sized window, the main button at the canvas device (W-158)", async ({
  page,
  request,
  context,
}) => {
  const text = `Preview size ${unique()}`;
  const id = await createPage(request, text, layoutFor(text), `preview-size-${unique()}`);
  await openEditor(page, id, text);

  const openFrom = async (choose: () => Promise<void>) => {
    const popup = context.waitForEvent("page");
    await choose();
    const opened = await popup;
    await opened.waitForLoadState();
    await expect(opened.getByRole("heading", { name: text })).toBeVisible();
    return opened;
  };
  const sizes = overlay(page).getByRole("button", { name: "Preview size" });

  const mobile = await openFrom(async () => {
    await sizes.click();
    await page.getByRole("menuitem", { name: "Mobile (390 px)" }).click();
  });
  expect(await mobile.evaluate(() => window.innerWidth)).toBe(390);
  await mobile.close();

  const tablet = await openFrom(async () => {
    await sizes.click();
    await page.getByRole("menuitem", { name: "Tablet (768 px)" }).click();
  });
  expect(await tablet.evaluate(() => window.innerWidth)).toBe(768);
  await tablet.close();

  // The main button previews the device on the canvas.
  await page.getByRole("tab", { name: "Mobile" }).click();
  const fromCanvas = await openFrom(() =>
    overlay(page).getByRole("button", { name: "Preview", exact: true }).click(),
  );
  expect(await fromCanvas.evaluate(() => window.innerWidth)).toBe(390);
  await fromCanvas.close();
});
