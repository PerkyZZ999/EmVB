import { homedir } from "node:os";
import { expect, test } from "@playwright/test";
import { createPage, getPage, publishPage, setUpEmvbOnce } from "./support/api.ts";
import { canvas, openEditor, overlay, saveDraft, unique } from "./support/helpers.ts";

// W-914 (W-341): a per-element text direction, set in the editor, reaches the canvas and the page.
setUpEmvbOnce();
const SHOTS = `${homedir()}/agent-tools/emvb-ui`;

test("W-914: Text direction on one element is shown on the canvas and published", async ({
  page,
  request,
}, info) => {
  const latin = `Hello ${unique()}`;
  const slug = `dir-${unique()}`;
  const id = await createPage(
    request,
    latin,
    {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "head0001", type: "heading", props: { text: latin, level: 2 } },
          { id: "text0001", type: "text", props: { text: "مرحبا بالعالم" } },
        ],
      },
    },
    slug,
  );
  await openEditor(page, id, latin);
  await canvas(page).getByText("مرحبا بالعالم").click();
  const editor = overlay(page);
  await editor.getByRole("tab", { name: "Style" }).click();
  const advanced = editor.locator('[data-emvb-section="advanced"]');
  if ((await advanced.getAttribute("aria-expanded")) !== "true") await advanced.click();
  await editor.getByRole("combobox", { name: "Text direction" }).click();
  await page.getByRole("option", { name: "Right to left", exact: true }).click();
  await expect(canvas(page).locator('[data-emvb-id="text0001"]')).toHaveAttribute("dir", "rtl");
  await expect(canvas(page).locator('[data-emvb-id="head0001"]')).not.toHaveAttribute("dir", /.+/);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({
      path: `${SHOTS}/w914-text-direction-${info.project.name}-${scheme}.png`,
    });
  }
  await page.emulateMedia({ colorScheme: "light" });
  // Closed, the Advanced header counts the direction as a set value.
  await advanced.click();
  await expect(advanced).toContainText("· 1");
  await saveDraft(page);
  expect(JSON.stringify((await getPage(request, id)).data["layout"])).toContain('"dir":"rtl"');
  await publishPage(request, id);
  await page.goto(`/${slug}`);
  await expect(page.getByText("مرحبا بالعالم")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: latin })).not.toHaveAttribute("dir", /.+/);
});
