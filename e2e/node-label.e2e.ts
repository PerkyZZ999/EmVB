import { expect, test } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { canvas, openEditor, openLayers, overlay, saveDraft, unique } from "./support/helpers.ts";

setUpEmvbOnce();

type Stored = { root: { children: { id: string; label?: string }[] } };

test("a layer is renamed by double-click, F2 and the row menu, the name is saved, and the page never shows it (W-157)", async ({
  page,
  request,
}) => {
  const slug = `node-label-${unique()}`;
  const id = await createPage(
    request,
    "Node label",
    {
      schemaVersion: 14,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "head0001", type: "heading", props: { text: "Labels", level: 1 } },
          { id: "text0001", type: "text", props: { text: "Body copy" } },
        ],
      },
    },
    slug,
  );
  await openEditor(page, id, "Labels");
  await openLayers(page);
  const row = (nodeId: string) => overlay(page).locator(`[data-emvb-layer="${nodeId}"]`);
  const nameField = overlay(page).getByRole("textbox", { name: "Layer name" });

  // Double-click: type a name, Enter saves it.
  await row("head0001").locator(".emvb-layer-select").first().dblclick();
  await expect(nameField).toBeFocused();
  await nameField.fill("Hero title");
  await nameField.press("Enter");
  await expect(row("head0001").locator("[data-emvb-layer-label]").first()).toContainText(
    "Hero title",
  );

  // F2 on a focused row, then Escape leaves it unnamed.
  await row("text0001").locator(".emvb-layer-select").first().focus();
  await page.keyboard.press("F2");
  await expect(nameField).toBeFocused();
  await nameField.fill("Never kept");
  await nameField.press("Escape");
  await expect(nameField).toHaveCount(0);
  await expect(row("text0001").locator("[data-emvb-layer-label]")).toHaveCount(0);

  // The row menu's Rename, blur saves.
  await row("text0001").hover();
  await row("text0001")
    .getByRole("button", { name: /more actions|actions/i })
    .first()
    .click();
  await overlay(page).getByRole("menuitem", { name: "Rename" }).click();
  await nameField.fill("  Intro copy  ");
  await nameField.blur();
  await expect(row("text0001").locator("[data-emvb-layer-label]").first()).toContainText(
    "Intro copy",
  );

  await saveDraft(page);
  const stored = await storedLayout<Stored>(request, id);
  expect(stored.root.children.map((c) => c.label)).toEqual(["Hero title", "Intro copy"]);
  await expect(canvas(page).locator(".emvb-heading")).toHaveText("Labels");

  await publishPage(request, id);
  await page.goto(`/${slug}`);
  await expect(page.locator("h1")).toHaveText("Labels");
  const html = await page.content();
  expect(html).not.toContain("Hero title");
  expect(html).not.toContain("Intro copy");
});
