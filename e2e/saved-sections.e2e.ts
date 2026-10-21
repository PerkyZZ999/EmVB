import { expect, test, type Page } from "@playwright/test";
import { api, createPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { loadDraft, setClass } from "./support/design.ts";
import { canvas, openEditor, openLayers, overlay, saveDraft, unique } from "./support/helpers.ts";

setUpEmvbOnce();

type Node = {
  id: string;
  type: string;
  classes?: string[];
  props?: Record<string, unknown>;
  children?: Node[];
};

const pageWith = (text: string, classId: string) => ({
  schemaVersion: 17,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      {
        id: "box00001",
        type: "div-block",
        props: {},
        children: [
          { id: "head0001", type: "heading", props: { text, level: 2 }, classes: [classId] },
        ],
      },
    ],
  },
});

/** Opens Save as section from the Div block's ··· menu in Layers. */
async function openSaveDialog(page: Page) {
  await openLayers(page);
  await overlay(page).getByRole("button", { name: "Actions for Div block" }).click();
  await overlay(page).getByRole("menuitem", { name: "Save as section…" }).click();
  const dialog = page.locator('[data-emvb-dialog="save-section"]');
  await expect(dialog).toBeVisible();
  return dialog;
}

const savedList = (page: Page) => overlay(page).locator("[data-emvb-saved-sections]");

test("save as a copy, insert with its class, rename and delete from My sections (W-876, D-060)", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const u = unique();
  const text = `Promo ${u}`;
  const classId = `promo-${u}`.slice(0, 40).toLowerCase();
  const className = `Promo card ${u}`;
  const name = `Promo section ${u}`;
  await setClass(request, classId, { name: className, style: { color: "#1d4ed8" } });
  const id = await createPage(request, text, pageWith(text, classId), `saved-${u}`);
  try {
    await openEditor(page, id, text);
    const dialog = await openSaveDialog(page);
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("button", { name: "Save section" }).click();
    await expect(dialog).toHaveCount(0);
    await overlay(page).getByRole("tab", { name: "Add" }).click();
    await expect(savedList(page).getByRole("button", { name, exact: true })).toBeVisible();

    // The site's class changes look after the save: inserting must not overwrite it.
    await setClass(request, classId, { name: className, style: { color: "#b91c1c" } });
    await openEditor(page, id, text);
    await overlay(page).getByRole("tab", { name: "Add" }).click();
    await overlay(page).getByLabel("Search elements").fill(u);
    await savedList(page).getByRole("button", { name, exact: true }).click();
    await expect(canvas(page).getByRole("heading", { name: text })).toHaveCount(2);
    await saveDraft(page);
    const stored = await storedLayout<{ root: Node }>(request, id);
    const copy = stored.root.children?.[1];
    expect(copy?.id).not.toBe("box00001");
    const copyClass = copy?.children?.[0]?.classes?.[0];
    expect(copyClass).toBeTruthy();
    expect(copyClass).not.toBe(classId);
    await expect
      .poll(async () => {
        const draft = await loadDraft(request);
        return (draft.design.classes ?? [])
          .filter((c) => c.name.startsWith(className))
          .map((c) => [c.name, (c.style as { color?: string }).color]);
      })
      .toEqual([
        [className, "#b91c1c"],
        [`${className} 2`, "#1d4ed8"],
      ]);

    // Rename in place: Enter saves and focus returns to the section.
    const renamed = `Renamed ${u}`;
    await savedList(page)
      .getByRole("button", { name: `Rename ${name}` })
      .click();
    const field = savedList(page).getByLabel("Section name");
    await field.fill(renamed);
    await field.press("Enter");
    const row = savedList(page).getByRole("button", { name: renamed, exact: true });
    await expect(row).toBeFocused();

    // Delete asks first; Cancel keeps it and returns focus to its Delete button.
    const del = savedList(page).getByRole("button", { name: `Delete ${renamed}` });
    await del.click();
    const confirm = page.locator('[data-emvb-dialog="delete-saved-section"]');
    await expect(confirm).toContainText(`Delete “${renamed}”?`);
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(del).toBeFocused();
    await del.click();
    await confirm.getByRole("button", { name: "Delete section" }).click();
    await expect(row).toHaveCount(0);
    // The search matched only this section, so focus goes back to the search field.
    await expect(overlay(page).getByLabel("Search elements")).toBeFocused();
    // Pages keep copies already inserted.
    await expect(canvas(page).getByRole("heading", { name: text })).toHaveCount(2);
  } finally {
    const draft = await loadDraft(request);
    for (const cls of draft.design.classes ?? []) {
      if (cls.name.startsWith(className)) await setClass(request, cls.id, null);
    }
  }
});

test("the command palette inserts a saved section (W-876)", async ({ page, request }) => {
  test.setTimeout(90_000);
  const u = unique();
  const text = `Palette ${u}`;
  const classId = `pal-${u}`.slice(0, 40).toLowerCase();
  await setClass(request, classId, { name: `Pal ${u}`, style: {} });
  const id = await createPage(request, text, pageWith(text, classId), `saved-pal-${u}`);
  const name = `Palette section ${u}`;
  try {
    await openEditor(page, id, text);
    const dialog = await openSaveDialog(page);
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("button", { name: "Save section" }).click();
    await expect(dialog).toHaveCount(0);
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    await page.keyboard.type(name);
    await palette.getByRole("option", { name: new RegExp(`Insert ${name}`) }).click();
    await expect(canvas(page).getByRole("heading", { name: text })).toHaveCount(2);
    // Clean up the list for the next run.
    await overlay(page).getByRole("tab", { name: "Add" }).click();
    await savedList(page)
      .getByRole("button", { name: `Delete ${name}` })
      .click();
    await page
      .locator('[data-emvb-dialog="delete-saved-section"]')
      .getByRole("button", { name: "Delete section" })
      .click();
  } finally {
    await setClass(request, classId, null);
  }
});

test("Synced makes a Section theme part and links the element to it (W-876, W-098)", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const u = unique();
  const text = `Synced ${u}`;
  const classId = `syn-${u}`.slice(0, 40).toLowerCase();
  await setClass(request, classId, { name: `Syn ${u}`, style: {} });
  const id = await createPage(request, text, pageWith(text, classId), `saved-syn-${u}`);
  let partId: string | undefined;
  try {
    await openEditor(page, id, text);
    const dialog = await openSaveDialog(page);
    await dialog.getByLabel("Name").fill(`Synced part ${u}`);
    await dialog.getByText("Synced", { exact: true }).click();
    await dialog.getByRole("button", { name: "Make synced section" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      overlay(page).locator(".emvb-layer-select", { hasText: "Theme section" }),
    ).toBeVisible();
    await saveDraft(page);
    const stored = await storedLayout<{ root: Node }>(request, id);
    const shell = stored.root.children?.[0];
    expect(shell?.type).toBe("section");
    partId = shell?.props?.["partId"] as string | undefined;
    expect(partId).toBeTruthy();
    expect(shell?.children?.[0]?.id).toBe("box00001");
    const part = await api(request, "GET", `/_emdash/api/content/emvb_theme_parts/${partId}`);
    expect(part.status).toBe(200);
    expect(JSON.stringify(part.json)).toContain('"part_type":"section"');
    expect(JSON.stringify(part.json)).toContain(text);
  } finally {
    if (partId) await api(request, "DELETE", `/_emdash/api/content/emvb_theme_parts/${partId}`);
    await setClass(request, classId, null);
  }
});
