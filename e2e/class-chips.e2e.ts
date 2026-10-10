import { expect, test, type Page } from "@playwright/test";
import { createPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { loadDraft, setClass } from "./support/design.ts";
import { canvas, openEditor, overlay, saveDraft, unique } from "./support/helpers.ts";

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

type Stored = { root: { children: { classes?: string[] }[] } };

const layoutWith = (text: string, classes?: string[]) => ({
  schemaVersion: 14,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
    children: [{ id: "head0001", type: "heading", props: { text, level: 1 }, classes }],
  },
});

const box = (page: Page) => overlay(page).locator("[data-emvb-chip-box]");
const input = (page: Page) => overlay(page).locator("[data-emvb-class-input]");
const chip = (page: Page, id: string) =>
  overlay(page).locator(`[data-emvb-class-id="${id}"] .emvb-chip-main`);
const chipIds = (page: Page) =>
  box(page)
    .locator("[data-emvb-class-id]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-emvb-class-id")));

/** Opens a page whose heading carries `classes`, selects the heading and shows Style. */
async function openStyle(
  page: Page,
  request: Parameters<typeof createPage>[0],
  classes?: string[],
) {
  const text = `Chips ${unique()}`;
  const id = await createPage(request, text, layoutWith(text, classes), `chips-${unique()}`);
  await openEditor(page, id, text);
  await canvas(page).getByRole("heading", { name: text }).click();
  await overlay(page).getByRole("tab", { name: "Style" }).click();
  await expect(box(page)).toBeVisible();
  return { id, text };
}

async function withClasses(
  request: Parameters<typeof setClass>[0],
  names: string[],
  run: (ids: string[]) => Promise<void>,
) {
  const ids = names.map((_, index) => `chip-${index}-${unique()}`);
  for (const [index, id] of ids.entries()) {
    // oxlint-disable-next-line no-await-in-loop -- one compare-and-set design save at a time
    await setClass(request, id, { name: `${names[index]} ${id}`, style: { color: "#112233" } });
  }
  try {
    await run(ids);
  } finally {
    for (const id of ids) {
      // oxlint-disable-next-line no-await-in-loop -- one compare-and-set design save at a time
      await setClass(request, id, null);
    }
  }
}

test("Classes chip input adds a class by typing and autocomplete", async ({ page, request }) => {
  await withClasses(request, ["Signal"], async ([classId = ""]) => {
    const { id, text } = await openStyle(page, request);
    await input(page).fill(classId.slice(0, 12));
    const option = overlay(page).locator(`[data-emvb-class-option="${classId}"]`);
    await expect(option).toBeVisible();
    await expect(option).toHaveAttribute("aria-selected", "true");
    await option.click();
    await expect(chip(page, classId)).toContainText(`Signal ${classId}`);
    await expect(input(page)).toHaveValue("");
    await expect(canvas(page).getByRole("heading", { name: text })).toHaveClass(
      new RegExp(`emvb-k-${classId}`),
    );
    await saveDraft(page);
    const stored = await storedLayout<Stored>(request, id);
    expect(stored.root.children[0]?.classes).toEqual([classId]);
  });
});

test("Classes chip input creates a new class inline with Enter", async ({ page, request }) => {
  const name = `Fresh ${unique()}`;
  await openStyle(page, request);
  let createdId: string | undefined;
  try {
    await input(page).fill(name);
    await expect(overlay(page).locator('[data-emvb-class-option="create"]')).toContainText(
      `Create class "${name}"`,
    );
    await input(page).press("Enter");
    await expect(box(page).locator(".emvb-chip-label", { hasText: name })).toBeVisible();
    const design = (await loadDraft(request)).design;
    createdId = design.classes?.find((c) => c.name === name)?.id;
    expect(createdId).toBeTruthy();
    expect(await chipIds(page)).toEqual([createdId]);
  } finally {
    createdId ??= (await loadDraft(request)).design.classes?.find((c) => c.name === name)?.id;
    if (createdId) await setClass(request, createdId, null);
  }
});

test("Classes chip input removes chips with the x, the menu and Backspace", async ({
  page,
  request,
}) => {
  await withClasses(request, ["One", "Two", "Three"], async (ids) => {
    const [a = "", b = "", c = ""] = ids;
    const { id, text } = await openStyle(page, request, ids);
    expect(await chipIds(page)).toEqual([a, b, c]);
    await box(page).locator(`[data-emvb-class-id="${b}"] [aria-label^="Remove"]`).click();
    expect(await chipIds(page)).toEqual([a, c]);
    await box(page)
      .getByRole("button", { name: `Actions for One ${a}` })
      .click();
    await page.getByRole("menuitem", { name: "Remove from element" }).click();
    expect(await chipIds(page)).toEqual([c]);
    await input(page).click();
    await input(page).press("Backspace");
    await expect(box(page).locator("[data-emvb-class-id]")).toHaveCount(0);
    await expect(canvas(page).getByRole("heading", { name: text })).toBeVisible();
    await saveDraft(page);
    const stored = await storedLayout<Stored>(request, id);
    expect(stored.root.children[0]?.classes).toBeUndefined();
  });
});

test("Classes chip input works from the keyboard", async ({ page, request }) => {
  await withClasses(request, ["First", "Second"], async (ids) => {
    const [a = "", b = ""] = ids;
    const { text } = await openStyle(page, request, ids);
    await input(page).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(chip(page, b)).toBeFocused();
    await page.keyboard.press("Alt+ArrowLeft");
    expect(await chipIds(page)).toEqual([b, a]);
    await expect(chip(page, b)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(chip(page, b)).toHaveAttribute("aria-pressed", "true");
    await expect(overlay(page).locator("[data-emvb-class-scope]")).toContainText(
      `Editing class "Second ${b}"`,
    );
    await page.keyboard.press("F2");
    const rename = overlay(page).locator(".emvb-chip-rename");
    await expect(rename).toBeFocused();
    await rename.fill(`Renamed ${b}`);
    await page.keyboard.press("Enter");
    await expect(chip(page, b)).toContainText(`Renamed ${b}`);
    await expect
      .poll(async () => (await loadDraft(request)).design.classes?.find((c) => c.id === b)?.name)
      .toBe(`Renamed ${b}`);
    await chip(page, b).focus();
    await page.keyboard.press("Backspace");
    expect(await chipIds(page)).toEqual([a]);
    await expect(overlay(page).locator("[data-emvb-chip-local] .emvb-chip-main")).toBeFocused();
    // Backspace on a chip must not reach the editor's delete-element shortcut.
    await expect(canvas(page).getByRole("heading", { name: text })).toBeVisible();
  });
});

test("Classes chip menu renames and duplicates", async ({ page, request }) => {
  await withClasses(request, ["Menu"], async ([classId = ""]) => {
    await openStyle(page, request, [classId]);
    await box(page)
      .getByRole("button", { name: `Actions for Menu ${classId}` })
      .click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const rename = overlay(page).locator(".emvb-chip-rename");
    await expect(rename).toBeFocused();
    await rename.fill(`Menu two ${classId}`);
    await rename.press("Enter");
    await expect(chip(page, classId)).toContainText(`Menu two ${classId}`);
    await box(page)
      .getByRole("button", { name: `Actions for Menu two ${classId}` })
      .click();
    await page.getByRole("menuitem", { name: "Duplicate" }).click();
    let copyId: string | undefined;
    try {
      await expect
        .poll(async () => {
          const classes = (await loadDraft(request)).design.classes ?? [];
          copyId = classes.find((c) => c.name === `Menu two ${classId} copy`)?.id;
          return copyId;
        })
        .toBeTruthy();
      expect(await chipIds(page)).toEqual([copyId]);
      await expect(chip(page, copyId ?? "")).toHaveAttribute("aria-pressed", "true");
    } finally {
      if (copyId) await setClass(request, copyId, null);
    }
  });
});
