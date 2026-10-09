import { expect, test } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { canvas, openEditor, openLayers, overlay, saveDraft, unique } from "./support/helpers.ts";

setUpEmvbOnce();

type Stored = { root: { children: { id: string; style?: Record<string, unknown> }[] } };

const px = (value: number) => ({ value, unit: "px" });

test("the linked boxes set padding on every side, and unlinked a side, border width or corner on its own (W-138)", async ({
  page,
  request,
  browser,
}) => {
  const text = `Boxes ${unique()}`;
  const slug = `boxes-${unique()}`;
  const layout = {
    schemaVersion: 13,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        {
          id: "card0001",
          type: "container",
          props: {},
          style: { borderStyle: "solid", borderColor: "#111111" },
          children: [{ id: "head0001", type: "heading", props: { text, level: 2 } }],
        },
      ],
    },
  };
  const id = await createPage(request, text, layout, slug);
  await openEditor(page, id, text);
  const card = canvas(page).locator('[data-emvb-id="card0001"]');
  await openLayers(page);
  await overlay(page).locator('[data-emvb-layer="card0001"] .emvb-layer-select').click();
  await overlay(page).getByRole("tab", { name: "Style" }).click();
  const field = (label: string) => overlay(page).getByLabel(label, { exact: true });
  const link = (group: string) => overlay(page).locator(`[data-emvb-box-link="${group}"]`);

  // Linked: one value on all four sides.
  await expect(link("padding")).toHaveAttribute("aria-pressed", "true");
  await field("Padding top").fill("24");
  await field("Padding top").press("Enter");
  await expect(card).toHaveCSS("padding-left", "24px");
  await expect(card).toHaveCSS("padding-bottom", "24px");
  await expect(field("Padding right")).toHaveValue("24");

  // Unlinked: only that side.
  await link("padding").click();
  await expect(link("padding")).toHaveAttribute("aria-pressed", "false");
  await field("Padding left").fill("4");
  await field("Padding left").press("Enter");
  await expect(card).toHaveCSS("padding-left", "4px");
  await expect(card).toHaveCSS("padding-top", "24px");

  // Border width: all sides, then the top on its own.
  await field("Border top width").fill("2");
  await field("Border top width").press("Enter");
  await expect(card).toHaveCSS("border-bottom-width", "2px");
  await link("borderWidth").click();
  await field("Border top width").fill("6");
  await field("Border top width").press("Enter");
  await expect(card).toHaveCSS("border-top-width", "6px");
  await expect(card).toHaveCSS("border-bottom-width", "2px");

  // One corner.
  await link("borderRadius").click();
  await field("Radius top left").fill("12");
  await field("Radius top left").press("Enter");
  await expect(card).toHaveCSS("border-top-left-radius", "12px");
  await expect(card).toHaveCSS("border-bottom-right-radius", "0px");

  await saveDraft(page);
  const stored = await storedLayout<Stored>(request, id);
  expect(stored.root.children[0]?.style).toEqual({
    borderStyle: "solid",
    borderColor: "#111111",
    paddingTop: px(24),
    paddingRight: px(24),
    paddingBottom: px(24),
    paddingLeft: px(4),
    borderWidth: px(2),
    borderTopWidth: px(6),
    borderTopLeftRadius: px(12),
  });

  await publishPage(request, id);
  const visitor = await browser.newContext();
  try {
    const site = await visitor.newPage();
    await site.goto(`/${slug}`);
    const shown = site.getByRole("heading", { name: text }).locator("..");
    await expect(shown).toHaveCSS("padding-left", "4px");
    await expect(shown).toHaveCSS("padding-top", "24px");
    await expect(shown).toHaveCSS("border-top-width", "6px");
    await expect(shown).toHaveCSS("border-bottom-width", "2px");
    await expect(shown).toHaveCSS("border-top-left-radius", "12px");
  } finally {
    await visitor.close();
  }
});
