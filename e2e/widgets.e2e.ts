import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { canvas, openEditor, openLayers, overlay, saveDraft, unique } from "./support/helpers.ts";

// PLAN_1.2 part D: each 1.2 widget is added from the Add panel, set up in its settings, saved,
// and published with no EmVB script unless it opts in.

setUpEmvbOnce();

type Stored = { root: { children: { type: string; props: Record<string, unknown> }[] } };

const startPage = (title: string) => ({
  schemaVersion: 18,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "head0001", type: "heading", props: { text: title, level: 1 } }],
  },
});

/** A new page open in the editor with the page root selected and the Add tab showing. */
async function addTab(page: Page, request: APIRequestContext, title: string) {
  const slug = `widgets-${unique()}`;
  const id = await createPage(request, title, startPage(title), slug);
  await openEditor(page, id, title);
  await openLayers(page);
  await overlay(page).locator('[data-emvb-layer="root0001"] .emvb-layer-select').click();
  await overlay(page).getByRole("tab", { name: "Add" }).click();
  return { id, slug };
}

test("a Star rating is added, set to 3.5 of 4, and published as an image with its rating as text (W-1023)", async ({
  page,
  request,
}) => {
  const { id, slug } = await addTab(page, request, "Ratings");
  await overlay(page).locator('[data-emvb-add-tile="rating"]').click();
  const stars = canvas(page).locator(".emvb-rating");
  await expect(stars).toHaveAttribute("aria-label", "Rated 4.5 out of 5");

  await expect(overlay(page).locator("h2.emvb-panel-title")).toHaveText("Star rating");
  const value = overlay(page).getByLabel("Rating", { exact: true });
  await value.fill("3.5");
  await value.blur();
  const count = overlay(page).getByLabel("Stars", { exact: true });
  await count.fill("4");
  await count.blur();
  // The Rating field reads its maximum from Stars.
  await value.fill("5");
  await value.blur();
  await expect(
    overlay(page).getByText("Enter a number from 0 up to the number of stars"),
  ).toBeVisible();
  await value.fill("3.5");
  await value.blur();
  await expect(stars).toHaveAttribute("aria-label", "Rated 3.5 out of 4");
  await expect(stars.locator(".emvb-rating-star")).toHaveCount(4);

  await saveDraft(page);
  const stored = await storedLayout<Stored>(request, id);
  expect(stored.root.children[1]).toMatchObject({ type: "rating", props: { value: 3.5, max: 4 } });

  await publishPage(request, id);
  await page.goto(`/${slug}`);
  const published = page.locator(".emvb-rating");
  await expect(published).toHaveAttribute("role", "img");
  await expect(page.getByRole("img", { name: "Rated 3.5 out of 4" })).toBeVisible();
  // The half star is half as wide as a whole one.
  const fills = await published
    .locator(".emvb-rating-fill")
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
  expect(fills).toEqual([20, 20, 20, 10]);
  // Each filled part sits on its star, not after it.
  const offsets = await published.locator(".emvb-rating-star").evaluateAll((els) =>
    els.map((el) => {
      const [empty, fill] = [...el.querySelectorAll("svg")].map((svg) =>
        svg.getBoundingClientRect(),
      );
      return [
        Math.round((fill?.left ?? -99) - (empty?.left ?? 0)),
        Math.round((fill?.top ?? -99) - (empty?.top ?? 0)),
      ];
    }),
  );
  expect(offsets).toEqual([
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ]);
  expect(await page.locator("script[src*='emvb'], script[data-emvb]").count()).toBe(0);
});

test("an Alert is added as a dismissible warning; on the page its close button hides it and keeps focus (W-1025)", async ({
  page,
  request,
}) => {
  const { id, slug } = await addTab(page, request, "Alerts");
  await overlay(page).locator('[data-emvb-add-tile="alert"]').click();
  const box = canvas(page).locator(".emvb-alert");
  await expect(box).toHaveClass(/emvb-alert-info/);
  await expect(overlay(page).locator("h2.emvb-panel-title")).toHaveText("Alert");

  await overlay(page).getByLabel("Kind").click();
  await page.getByRole("option", { name: "Warning", exact: true }).click();
  await expect(box).toHaveClass(/emvb-alert-warning/);
  await overlay(page).getByRole("switch", { name: "Visitors can dismiss it" }).click();
  // In the editor the close button stays hidden: the script runs on the public page only.
  await expect(box.locator(".emvb-alert-dismiss")).toBeHidden();

  await saveDraft(page);
  const stored = await storedLayout<Stored>(request, id);
  expect(stored.root.children[1]).toMatchObject({
    type: "alert",
    props: { variant: "warning", dismissible: true },
  });

  await publishPage(request, id);
  await page.goto(`/${slug}`);
  const note = page.getByRole("note");
  await expect(note).toContainText("Something your visitors should know.");
  const close = note.getByRole("button", { name: "Dismiss" });
  await expect(close).toBeVisible();
  await close.focus();
  await page.keyboard.press("Enter");
  await expect(note).toBeHidden();
  // Focus didn't fall back to the page: it is on an element, not the body.
  expect(await page.evaluate(() => document.activeElement?.tagName ?? "")).not.toBe("BODY");
});
