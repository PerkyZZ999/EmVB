import { expect, test } from "@playwright/test";
import { createPage, setUpEmvbOnce } from "./support/api.ts";
import { EDITOR, unique } from "./support/helpers.ts";

const layout = {
  schemaVersion: 4,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "head0001", type: "heading", props: { text: "Overlay", level: 1 } }],
  },
};

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

test("below 1024 px the small-screen notice replaces the editor (W-043)", async ({
  page,
  request,
}) => {
  const id = await createPage(request, "Narrow", layout, `narrow-${unique()}`);
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto(`${EDITOR}?entry=${id}`);
  await expect(page.getByText("EmVB needs a larger screen")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("iframe[data-emvb-canvas]")).toHaveCount(0);
});

// Toast stacking above the overlay is covered by editing.e2e.ts
// "Delete shows a Restore toast above the editor…" (W-010 / W-043).
