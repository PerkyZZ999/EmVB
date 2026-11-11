import { homedir } from "node:os";
import { expect, test } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { canvas, openEditor, saveDraft, unique } from "./support/helpers.ts";

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

const layoutFor = (text: string) => ({
  schemaVersion: 17,
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
    `@media (max-width: 767.98px){:where(.emvb-s-${id}) .emvb-e-head0001{display:none}}`,
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
    heading.devices = { laptop: { color: "#555555" }, tablet: { color: "#111111" } };
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

  // W-956: Laptop shows its own styles; Tablet's win over them.
  await page.getByRole("tab", { name: "Laptop" }).click();
  await expect(page.locator("[data-emvb-device]")).toHaveAttribute("data-emvb-device", "laptop");
  await expect.poll(color).toBe("rgb(85, 85, 85)");

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
  for (const name of ["Desktop", "Laptop", "Tablet", "Mobile"]) {
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

test("the active device tab follows a light/dark switch at once (W-905)", async ({
  page,
  request,
}) => {
  const text = `Theme ${unique()}`;
  const id = await createPage(request, text, layoutFor(text), `theme-${unique()}`);
  await page.emulateMedia({ colorScheme: "light" });
  await openEditor(page, id, text);
  const pill = page.locator('.emvb-device-tabs [role="tablist"] > div');
  const light = await pill.evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.emulateMedia({ colorScheme: "dark" });
  const first = await pill.evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.waitForTimeout(500);
  const settled = await pill.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(settled).not.toBe(light);
  expect(first).toBe(settled);
  const tab = page.getByRole("tab", { name: "Desktop" });
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await page.locator(".emvb-device-bar").screenshot({
    path: `${homedir()}/agent-tools/emvb-ui/device-tabs-${test.info().project.name}-dark.png`,
  });
});

test("W-956: a published page uses its laptop styles and Hide on Laptop only on laptops", async ({
  page,
  request,
}) => {
  const text = `Laptop ${unique()}`;
  const slug = `laptop-${unique()}`;
  const layout = {
    ...layoutFor(text),
    schemaVersion: 18,
  } as ReturnType<typeof layoutFor> & { schemaVersion: number };
  const heading = layout.root.children[0] as Record<string, unknown> | undefined;
  if (heading) {
    heading["style"] = { color: "#333333" };
    heading["devices"] = { laptop: { color: "#555555" } };
  }
  layout.root.children.push({
    id: "head0002",
    type: "heading",
    props: { text: `${text} desk`, level: 2 },
    hiddenOn: ["laptop"],
  } as never);
  const id = await createPage(request, text, layout, slug);
  await publishPage(request, id);
  const colorAt = async (width: number) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${slug}`);
    return page
      .getByRole("heading", { name: text, exact: true, level: 1 })
      .evaluate((el) => getComputedStyle(el).color);
  };
  expect(await colorAt(1440)).toBe("rgb(51, 51, 51)");
  await expect(page.getByRole("heading", { name: `${text} desk` })).toBeVisible();
  expect(await colorAt(1200)).toBe("rgb(85, 85, 85)");
  await expect(page.getByRole("heading", { name: `${text} desk` })).toBeHidden();
  expect(await colorAt(800)).toBe("rgb(85, 85, 85)");
  await expect(page.getByRole("heading", { name: `${text} desk` })).toBeVisible();
});

test("W-959: Hide on Desktop also hides on wide screens; Wide screen has its own styles and hide", async ({
  page,
  request,
}) => {
  const text = `Wide ${unique()}`;
  const slug = `wide-${unique()}`;
  const id = await createPage(request, text, layoutFor(text), slug);
  await openEditor(page, id, text);
  await canvas(page).getByRole("heading", { name: text }).click();
  // Hide on Desktop: Wide screen follows it.
  await page.getByRole("tab", { name: "Desktop" }).click();
  await page.getByRole("checkbox", { name: "Hide on desktop" }).check();
  await page.getByRole("tab", { name: "Wide screen" }).click();
  await expect(page.locator("[data-emvb-device]")).toHaveAttribute("data-emvb-device", "wide");
  await expect(page.getByRole("checkbox", { name: /Hide on wide screen/ })).toBeChecked();
  await expect(page.locator("[data-emvb-hide-inherited]")).toBeVisible();
  await saveDraft(page);
  await publishPage(request, id);
  const shown = async (width: number) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${slug}`);
    return page.getByRole("heading", { name: text, exact: true }).isVisible();
  };
  expect(await shown(1440)).toBe(false);
  expect(await shown(2560)).toBe(false);
  expect(await shown(1200)).toBe(true);

  // Show it again on Wide screen only: its own choice.
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page, id);
  // Hidden on Desktop and Wide screen: select it where it shows, then switch.
  await page.getByRole("tab", { name: "Laptop" }).click();
  await canvas(page).getByRole("heading", { name: text }).click();
  await page.getByRole("tab", { name: "Wide screen" }).click();
  await page.getByRole("checkbox", { name: /Hide on wide screen/ }).uncheck();
  await expect(page.locator("[data-emvb-hide-inherited]")).toHaveCount(0);
  await saveDraft(page);
  const stored = await storedLayout<{
    root: { children?: { hiddenOn?: string[]; style?: { wide?: { hidden?: boolean } } }[] };
  }>(request, id);
  expect(stored.root.children?.[0]?.hiddenOn).toEqual(["desktop"]);
  expect(stored.root.children?.[0]?.style?.wide).toEqual({ hidden: false });
  await publishPage(request, id);
  expect(await shown(2560)).toBe(true);
  expect(await shown(1440)).toBe(false);
});
