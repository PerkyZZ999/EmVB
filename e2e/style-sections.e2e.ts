import { expect, test, type Page } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { loadDesign, setClass } from "./support/design.ts";
import { canvas, openEditor, overlay, saveDraft, unique } from "./support/helpers.ts";

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

type Styled = { style?: Record<string, unknown>; children?: Styled[] };
type Stored = { root: Styled };

const layoutFor = (text: string, classes?: string[]) => ({
  schemaVersion: 5,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "column" },
    children: [
      {
        id: "card0001",
        type: "container",
        props: {},
        style: { paddingTop: { value: 24, unit: "px" }, paddingLeft: { value: 24, unit: "px" } },
        children: [{ id: "head0001", type: "heading", props: { text, level: 2 }, classes }],
      },
    ],
  },
});

/** Creates a page with a card holding one heading and opens it in the editor. */
async function openPage(page: Page, request: Parameters<typeof createPage>[0], classes?: string[]) {
  const text = `Sections ${unique()}`;
  const slug = `sections-${unique()}`;
  const id = await createPage(request, text, layoutFor(text, classes), slug);
  await openEditor(page, id, text);
  return { id, slug, text };
}

const showStyle = async (page: Page) => {
  const tab = overlay(page).getByRole("tab", { name: "Style" });
  if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
};

async function openSection(page: Page, section: string) {
  const header = overlay(page).locator(`[data-emvb-section="${section}"]`);
  if ((await header.getAttribute("aria-expanded")) !== "true") await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "true");
}

async function pick(page: Page, label: string, option: string) {
  await overlay(page).getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(overlay(page).getByRole("combobox", { name: label, exact: true })).toContainText(
    option,
  );
}

async function type(page: Page, label: string, value: string) {
  const field = overlay(page).getByLabel(label, { exact: true });
  await field.fill(value);
  await field.press("Enter");
}

const computed = <K extends string>(page: Page, selector: string, keys: K[], inCanvas: boolean) =>
  (inCanvas ? canvas(page).locator(selector) : page.locator(selector)).evaluate((el, names) => {
    const style = getComputedStyle(el);
    return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)]));
  }, keys as string[]) as Promise<Record<K, string>>;

/** Content width of `selector` as a share of its parent's content width. */
const widthShare = (page: Page, selector: string, inCanvas: boolean) =>
  (inCanvas ? canvas(page).locator(selector) : page.locator(selector)).evaluate((el) => {
    const [own, parent] = [el, el.parentElement as Element].map((node) => {
      const style = getComputedStyle(node);
      return node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    });
    return (own ?? 0) / (parent ?? 1);
  });

test("Size section sets width in %, max height, overflow and aspect ratio on canvas and published page", async ({
  page,
  request,
}) => {
  const { id, slug } = await openPage(page, request);
  await canvas(page)
    .locator('[data-emvb-id="card0001"]')
    .click({ position: { x: 4, y: 4 } });
  await showStyle(page);
  await openSection(page, "size");
  await overlay(page).getByRole("button", { name: "Width unit (px)", exact: true }).click();
  await page.locator('[data-emvb-unit-option="%"]').click();
  await expect(
    overlay(page).getByRole("button", { name: "Width unit (%)", exact: true }),
  ).toBeVisible();
  await type(page, "Width", "60");
  await type(page, "Max height", "200");
  await pick(page, "Overflow", "Hidden");
  await pick(page, "Aspect ratio", "16:9");

  const keys = ["max-height", "overflow", "aspect-ratio"];
  const expected = { "max-height": "200px", overflow: "hidden", "aspect-ratio": "16 / 9" };
  const card = ".emvb-e-card0001";
  await expect.poll(() => computed(page, card, keys, true)).toEqual(expected);
  expect(await widthShare(page, card, true)).toBeCloseTo(0.6, 2);

  await saveDraft(page);
  const stored = await storedLayout<Stored>(request, id);
  expect(stored.root.children?.[0]?.style).toMatchObject({
    width: { value: 60, unit: "%" },
    maxHeight: { value: 200, unit: "px" },
    overflow: "hidden",
    aspectRatio: "16/9",
  });
  await publishPage(request, id);
  await page.goto(`/${slug}`);
  expect(await computed(page, card, keys, false)).toEqual(expected);
  expect(await widthShare(page, card, false)).toBeCloseTo(0.6, 2);
});

test("Position section shows offsets once positioned and pins a heading in its card", async ({
  page,
  request,
}) => {
  const { id, slug, text } = await openPage(page, request);
  await canvas(page)
    .locator('[data-emvb-id="card0001"]')
    .click({ position: { x: 4, y: 4 } });
  await showStyle(page);
  await openSection(page, "position");
  await pick(page, "Position", "Relative");

  await canvas(page).getByRole("heading", { name: text }).click();
  await showStyle(page);
  await openSection(page, "position");
  await expect(overlay(page).locator("[data-emvb-offsets-help]")).toBeVisible();
  await expect(overlay(page).getByLabel("Top", { exact: true })).toHaveCount(0);
  await pick(page, "Position", "Absolute");
  await expect(overlay(page).locator("[data-emvb-offsets-help]")).toHaveCount(0);
  await type(page, "Top", "8");
  await type(page, "Right", "-4");
  await type(page, "Z-index", "5");

  const keys = ["position", "top", "right", "z-index"];
  const expected = { position: "absolute", top: "8px", right: "-4px", "z-index": "5" };
  const heading = ".emvb-e-head0001";
  await expect.poll(() => computed(page, heading, keys, true)).toEqual(expected);
  expect(await computed(page, ".emvb-e-card0001", ["position"], true)).toEqual({
    position: "relative",
  });

  await saveDraft(page);
  const stored = await storedLayout<Stored>(request, id);
  expect(stored.root.children?.[0]?.children?.[0]?.style).toMatchObject({
    position: "absolute",
    top: { value: 8, unit: "px" },
    right: { value: -4, unit: "px" },
    zIndex: 5,
  });
  await publishPage(request, id);
  await page.goto(`/${slug}`);
  expect(await computed(page, heading, keys, false)).toEqual(expected);
  expect(await computed(page, ".emvb-e-card0001", ["position"], false)).toEqual({
    position: "relative",
  });
});

test("Effects section edits a class: opacity, inset shadow, grayscale and cursor reach canvas and published page", async ({
  page,
  request,
}) => {
  const classId = `fx-${unique()}`;
  await setClass(request, classId, { name: `Effects ${classId}`, style: {} });
  try {
    const { id, slug, text } = await openPage(page, request, [classId]);
    await canvas(page).getByRole("heading", { name: text }).click();
    await showStyle(page);
    const chip = overlay(page).locator(`[data-emvb-class-id="${classId}"] .emvb-chip-main`);
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await openSection(page, "effects");
    await type(page, "Opacity (%)", "50");
    await overlay(page).getByRole("button", { name: "Add shadow" }).click();
    await type(page, "Blur", "6");
    const inset = overlay(page).getByRole("checkbox", { name: "Inset" });
    await inset.click();
    await expect(inset).toBeChecked();
    await type(page, "Grayscale (%)", "100");
    await pick(page, "Cursor", "Pointer");

    const keys = ["opacity", "box-shadow", "filter", "cursor"];
    const expected = {
      opacity: "0.5",
      "box-shadow": "rgba(0, 0, 0, 0.18) 0px 4px 6px 0px inset",
      filter: "grayscale(1)",
      cursor: "pointer",
    };
    const heading = `.emvb-k-${classId}`;
    await expect.poll(() => computed(page, heading, keys, true)).toEqual(expected);
    await expect
      .poll(async () => (await loadDesign(request)).design.classes?.find((c) => c.id === classId))
      .toMatchObject({
        style: {
          opacity: 0.5,
          boxShadow: { x: 0, y: 4, blur: 6, spread: 0, color: "#0000002e", inset: true },
          filter: { grayscale: 100 },
          cursor: "pointer",
        },
      });
    const stored = await storedLayout<Stored>(request, id);
    expect(stored.root.children?.[0]?.children?.[0]?.style).toBeUndefined();

    await publishPage(request, id);
    await page.goto(`/${slug}`);
    expect(await computed(page, heading, keys, false)).toEqual(expected);
  } finally {
    await setClass(request, classId, null);
  }
});
