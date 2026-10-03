import { expect, test } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { canvas, openEditor, saveDraft, unique } from "./support/helpers.ts";

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

const layoutFor = (text: string) => ({
  schemaVersion: 9,
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
    `@media (max-width: 767px){:where([data-emvb-scope="${id}"]) .emvb-e-head0001{display:none}}`,
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
  expect(frameWidth).toBeLessThan(1025);
  const color = () => title.evaluate((el) => getComputedStyle(el).color);
  await expect.poll(color).toBe("rgb(51, 51, 51)");

  await page.getByRole("tab", { name: "Tablet" }).click();
  await expect(page.locator("[data-emvb-device]")).toHaveAttribute("data-emvb-device", "tablet");
  await expect.poll(color).toBe("rgb(17, 17, 17)");

  await page.getByRole("tab", { name: "Desktop" }).click();
  await expect.poll(color).toBe("rgb(51, 51, 51)");
});
