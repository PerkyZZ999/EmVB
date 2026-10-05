import { expect, test } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { canvas, openEditor, openLayers, overlay, saveDraft, unique } from "./support/helpers.ts";

setUpEmvbOnce();

type Stored = {
  root: {
    children: {
      type: string;
      props: Record<string, unknown>;
      children?: { type: string }[];
    }[];
  };
};

test("a layout Section is added, takes a dropped element in its inner box, and keeps its content width on the page (W-156)", async ({
  page,
  request,
}) => {
  const slug = `layout-section-${unique()}`;
  const id = await createPage(
    request,
    "Layout section",
    {
      schemaVersion: 11,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [{ id: "head0001", type: "heading", props: { text: "Sections", level: 1 } }],
      },
    },
    slug,
  );
  await openEditor(page, id, "Sections");
  await openLayers(page);
  await overlay(page).locator('[data-emvb-layer="root0001"] .emvb-layer-select').click();
  await overlay(page).getByRole("tab", { name: "Add" }).click();
  await overlay(page).locator('[data-emvb-add-tile="layout-section"]').click();

  const inner = canvas(page).locator(".emvb-layout-section > .emvb-layout-section-inner");
  await expect(inner).toHaveCount(1);
  expect((await inner.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);

  // Drag a Text tile into the empty inner box with real pointer events.
  const tile = overlay(page).locator('[data-emvb-add-tile="text"]');
  const from = await tile.boundingBox();
  const to = await inner.boundingBox();
  if (!from || !to) throw new Error("no boxes");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 16 });
  await page.mouse.up();
  await expect(inner.locator(".emvb-text")).toHaveCount(1, { timeout: 10_000 });

  // Content width 600 px: the inner box is 600 px wide and centred in the full-width section.
  await canvas(page)
    .locator(".emvb-layout-section")
    .click({ position: { x: 4, y: 4 } });
  await expect(overlay(page).locator(".emvb-panel-title")).toHaveText("Section");
  const width = overlay(page).getByLabel("Content width (px)");
  await width.fill("600");
  await width.blur();
  await expect.poll(async () => (await inner.boundingBox())?.width).toBe(600);

  await saveDraft(page);
  const stored = await storedLayout<Stored>(request, id);
  const section = stored.root.children[1];
  expect(section?.type).toBe("layout-section");
  expect(section?.props).toEqual({ contentWidth: { value: 600, unit: "px" } });
  expect(section?.children?.map((c) => c.type)).toEqual(["text"]);

  await publishPage(request, id);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/${slug}`);
  const publicSection = page.locator("section.emvb-layout-section");
  const publicInner = publicSection.locator("> .emvb-layout-section-inner");
  await expect(publicInner.locator(".emvb-text")).toHaveCount(1);
  const outer = await publicSection.boundingBox();
  const box = await publicInner.boundingBox();
  if (!outer || !box) throw new Error("no public boxes");
  expect(box.width).toBe(600);
  expect(Math.abs(box.x - outer.x - (outer.width - 600) / 2)).toBeLessThan(1.5);
});
