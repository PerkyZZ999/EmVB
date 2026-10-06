import { expect, test } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { canvas, openEditor, saveDraft, unique } from "./support/helpers.ts";

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

const layoutFor = (text: string) => ({
  schemaVersion: 12,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
    children: [{ id: "head0001", type: "heading", props: { text, level: 1 } }],
  },
});

test("Hide on mobile is stored and the published CSS hides that element", async ({
  page,
  request,
}) => {
  const text = `Device ${unique()}`;
  const slug = `device-${unique()}`;
  const id = await createPage(request, text, layoutFor(text), slug);
  await openEditor(page, id, text);
  await canvas(page).getByRole("heading", { name: text }).click();
  await page.getByRole("tab", { name: "Mobile" }).click();
  await expect(page.locator("[data-emvb-device]")).toHaveAttribute("data-emvb-device", "mobile");
  await page.getByRole("checkbox", { name: "Hide on mobile" }).check();
  await saveDraft(page);
  const stored = await storedLayout<{
    root: { children?: { id: string; hiddenOn?: string[] }[] };
  }>(request, id);
  expect(stored.root.children?.[0]?.hiddenOn).toEqual(["mobile"]);

  await publishPage(request, id);
  await page.goto(`/${slug}`);
  const sheet = (await page.locator("style").allTextContents()).join("\n");
  expect(sheet).toContain(
    `@media (max-width: 767px){:where(.emvb-s-${id}) .emvb-e-head0001{display:none}}`,
  );
});

test("the Desktop canvas uses desktop styles even in a window narrower than a desktop (W-116)", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  const text = `Wide ${unique()}`;
  const layout = layoutFor(text);
  const heading = layout.root.children[0] as { style?: object; devices?: object } | undefined;
  if (heading) {
    heading.style = { color: "#333333" };
    heading.devices = { tablet: { color: "#111111" } };
  }
  const id = await createPage(request, text, layout, `wide-${unique()}`);
  await openEditor(page, id, text);
  const title = canvas(page).getByRole("heading", { name: text });
  const frameWidth = await canvas(page)
    .locator("body")
    .evaluate(() => window.innerWidth);
  // W-158: the page is laid out 1280 px wide and scaled down to fit the narrower stage.
  expect(frameWidth).toBe(1280);
  expect((await page.locator("iframe[data-emvb-canvas]").boundingBox())?.width ?? 0).toBeLessThan(
    1025,
  );
  const color = () => title.evaluate((el) => getComputedStyle(el).color);
  await expect.poll(color).toBe("rgb(51, 51, 51)");

  await page.getByRole("tab", { name: "Tablet" }).click();
  await expect(page.locator("[data-emvb-device]")).toHaveAttribute("data-emvb-device", "tablet");
  await expect.poll(color).toBe("rgb(17, 17, 17)");

  await page.getByRole("tab", { name: "Desktop" }).click();
  await expect.poll(color).toBe("rgb(51, 51, 51)");
});

test("the device switcher hugs its options, each with an icon and its name (W-127)", async ({
  page,
  request,
}) => {
  const text = `Switcher ${unique()}`;
  const id = await createPage(request, text, layoutFor(text), `switcher-${unique()}`);
  await openEditor(page, id, text);
  const list = page.getByRole("tablist", { name: "Device" });
  for (const name of ["Desktop", "Tablet", "Mobile"]) {
    const tab = list.getByRole("tab", { name, exact: true });
    await expect(tab).toBeVisible();
    await expect(tab.locator('svg[aria-hidden="true"]')).toHaveCount(1);
  }
  const gaps = await list.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const tabs = [...el.querySelectorAll('[role="tab"]')].map((t) => t.getBoundingClientRect());
    return {
      left: Math.round((tabs[0]?.left ?? 0) - box.left),
      right: Math.round(box.right - (tabs.at(-1)?.right ?? 0)),
    };
  });
  // Only the control's own padding is left on each side, the same on both.
  expect(gaps.right).toBeLessThanOrEqual(gaps.left + 2);
});

test("Tablet and Mobile previews scroll without a scrollbar of their own (W-140)", async ({
  page,
  request,
}) => {
  const text = `Tall ${unique()}`;
  const layout = layoutFor(text);
  layout.root.children.push(
    ...Array.from({ length: 50 }, (_, i) => ({
      id: `tall${String(i).padStart(4, "0")}`,
      type: "heading",
      props: { text: `Row ${i}`, level: 1 },
    })),
  );
  const id = await createPage(request, text, layout, `tall-${unique()}`);
  await openEditor(page, id, text);
  const root = canvas(page).locator("html");
  const bar = () => root.evaluate((el) => getComputedStyle(el).scrollbarWidth);
  await expect.poll(bar).toBe("auto");
  for (const name of ["Mobile", "Tablet"]) {
    await page.getByRole("tab", { name }).click();
    await expect.poll(bar).toBe("none");
    // The page gets the whole frame width: no scrollbar takes a strip of it.
    const frame = await page.locator("iframe[data-emvb-canvas]").evaluate((el) => el.clientWidth);
    await expect.poll(() => root.evaluate((el) => el.clientWidth)).toBe(frame);
  }
  // Still scrolls with the wheel.
  await page.locator(".emvb-stage").hover();
  await page.mouse.wheel(0, 600);
  await expect
    .poll(() => root.evaluate((el) => el.ownerDocument.defaultView?.scrollY ?? 0))
    .toBeGreaterThan(0);
  await page.getByRole("tab", { name: "Desktop" }).click();
  await expect.poll(bar).toBe("auto");
});
