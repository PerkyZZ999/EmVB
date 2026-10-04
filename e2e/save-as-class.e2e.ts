import { expect, test } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { setClass } from "./support/design.ts";
import {
  canvas,
  openEditor,
  overlay,
  publishSiteStyles,
  saveDraft,
  unique,
} from "./support/helpers.ts";

setUpEmvbOnce();

type Stored = {
  root: { children: { id: string; classes?: string[]; style?: unknown; states?: unknown }[] };
};

const BLUE = "rgb(29, 78, 216)";

test("Save local styles as class moves them into a class, undoes in one step and reaches the site (W-134)", async ({
  page,
  request,
  browser,
}) => {
  const text = `Save as class ${unique()}`;
  const slug = `save-class-${unique()}`;
  const layout = {
    schemaVersion: 9,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
      children: [
        { id: "head0001", type: "heading", props: { text, level: 1 } },
        {
          id: "butn0001",
          type: "button",
          props: { text: "Sign up", href: "/signup" },
          style: { backgroundColor: "#1d4ed8", color: "#ffffff" },
          states: { hover: { backgroundColor: "#1e3a8a" } },
        },
      ],
    },
  };
  const id = await createPage(request, text, layout, slug);
  const name = `Brand ${unique()}`;
  let classId: string | null = null;
  try {
    await openEditor(page, id, text);
    const button = canvas(page).locator(".emvb-button");
    await button.click();
    await overlay(page).getByRole("tab", { name: "Style" }).click();
    const chips = overlay(page).locator("[data-emvb-chip-box] [data-emvb-class-id]");
    await expect(chips).toHaveCount(0);

    await overlay(page).getByRole("button", { name: "Save local styles as class" }).click();
    await overlay(page).getByLabel("New class name").fill(name);
    await page.keyboard.press("Enter");
    await expect(overlay(page).locator("[data-emvb-save-local-done]")).toHaveText(
      `Saved as class "${name}". Publish site styles to show it on the site.`,
    );
    await expect(chips).toHaveCount(1);
    classId = await chips.first().getAttribute("data-emvb-class-id");
    await expect(button).toHaveCSS("background-color", BLUE);
    await expect(
      overlay(page).getByRole("button", { name: "Save local styles as class" }),
    ).toHaveCount(0);

    // One Ctrl+Z puts the local styles back and takes the class off; Ctrl+Y does it again.
    await page.keyboard.press("ControlOrMeta+z");
    await expect(chips).toHaveCount(0);
    await expect(
      overlay(page).getByRole("button", { name: "Save local styles as class" }),
    ).toBeVisible();
    await expect(button).toHaveCSS("background-color", BLUE);
    await page.keyboard.press("ControlOrMeta+y");
    await expect(chips).toHaveCount(1);

    await saveDraft(page);
    const stored = await storedLayout<Stored>(request, id);
    const saved = stored.root.children[1];
    expect(saved?.classes).toEqual([classId]);
    expect(saved?.style).toBeUndefined();
    expect(saved?.states).toBeUndefined();

    await publishSiteStyles(page);
    await publishPage(request, id);
    const visitor = await browser.newContext();
    try {
      const site = await visitor.newPage();
      await site.goto(`/${slug}`);
      const shown = site.locator(".emvb-button");
      await expect(shown).toHaveText("Sign up");
      await expect(shown).toHaveClass(new RegExp(`emvb-k-${classId}`));
      await expect(shown).toHaveCSS("background-color", BLUE);
    } finally {
      await visitor.close();
    }
  } finally {
    if (classId) await setClass(request, classId, null);
  }
});
