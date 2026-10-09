import { expect, test, type Page } from "@playwright/test";
import { createPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { setColor } from "./support/design.ts";
import { canvas, openEditor, overlay, saveDraft, unique } from "./support/helpers.ts";

setUpEmvbOnce();

type Stored = { root: { children: { style?: { color?: unknown } }[] } };

const rgb = (hex: string) => {
  const digits = hex.slice(1, hex.length <= 5 ? 4 : 7);
  const full = digits.length === 3 ? [...digits].map((c) => c + c).join("") : digits;
  const n = Number.parseInt(full, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

async function openTypography(page: Page) {
  await overlay(page).getByRole("tab", { name: "Style" }).click();
  const header = overlay(page).locator('[data-emvb-section="typography"]');
  if ((await header.getAttribute("aria-expanded")) !== "true") await header.click();
}

test("the colour field takes a validated custom hex and binds a variable from its swatches (W-136)", async ({
  page,
  request,
}) => {
  const variable = `w136-${unique()}`;
  await setColor(request, variable, "#0055ff");
  try {
    const text = `Colour ${unique()}`;
    const layout = {
      schemaVersion: 13,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [{ id: "head0001", type: "heading", props: { text, level: 1 } }],
      },
    };
    const id = await createPage(request, text, layout, `colour-${unique()}`);
    await openEditor(page, id, text);
    const heading = canvas(page).getByRole("heading", { name: text });
    await heading.click();
    await openTypography(page);
    const control = overlay(page).locator('[data-emvb-control="color"]').first();
    await expect(control.getByText("Color", { exact: true })).toBeVisible();

    await control.getByRole("combobox").click();
    await page.getByRole("option", { name: "Custom color" }).click();
    const hex = control.getByLabel("Custom color");
    await hex.fill("orange");
    await hex.press("Enter");
    await expect(control.getByRole("alert")).toHaveText("Enter a hex color such as #1a2b3c.");
    await hex.fill("#c2410c");
    await hex.press("Enter");
    await expect(control.getByRole("alert")).toHaveCount(0);
    await expect(heading).toHaveCSS("color", rgb("#c2410c"));
    await expect(control.getByRole("combobox")).toContainText("#c2410c");

    const first = control.locator("[data-emvb-swatches] button").first();
    const label = (await first.getAttribute("aria-label")) ?? "";
    const value = /\((#[0-9a-f]{3,8})\)$/i.exec(label)?.[1] ?? "";
    await first.click();
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await expect(control.getByLabel("Custom color")).toHaveCount(0);
    await expect(heading).toHaveCSS("color", rgb(value));

    await saveDraft(page);
    const stored = await storedLayout<Stored>(request, id);
    expect(stored.root.children[0]?.style?.color).toMatchObject({ var: expect.any(String) });
  } finally {
    await setColor(request, variable, null);
  }
});
