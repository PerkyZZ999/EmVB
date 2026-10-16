import { expect, test } from "@playwright/test";
import { createThemePart, setUpEmvbOnce } from "./support/api.ts";
import { canvas, overlay, unique } from "./support/helpers.ts";

setUpEmvbOnce();

test("W-711: a failed template load keeps the create dialog for a successful retry", async ({
  page,
  request,
}) => {
  const name = `Template recovery ${unique()}`;
  const id = await createThemePart(request, {
    title: name,
    slug: `template-recovery-${unique()}`,
    partType: "page_template",
    layout: {
      schemaVersion: 16,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "head0001",
            type: "heading",
            props: { text: "Recovered template heading", level: 1 },
          },
        ],
      },
    },
  });
  const templatePath = `**/_emdash/api/content/emvb_theme_parts/${id}`;
  await page.route(templatePath, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "UNAVAILABLE", message: "Temporarily unavailable" } }),
    }),
  );
  let creates = 0;
  await page.route("**/_emdash/api/content/emvb_pages", async (route) => {
    if (route.request().method() === "POST") creates += 1;
    await route.continue();
  });
  await page.goto("/_emdash/admin/plugins/emvb/pages");
  await page.getByRole("button", { name: "New page", exact: true }).click();
  await page.getByRole("combobox", { name: "Page template", exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
  const title = `Recovered page ${unique()}`;
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Create page", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "The selected page template couldn't be loaded",
    { timeout: 5000 },
  );
  expect(creates).toBe(0);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(title);
  await page.unroute(templatePath);
  await page.getByRole("button", { name: "Create page", exact: true }).click();
  await expect(overlay(page)).toBeVisible({ timeout: 20_000 });
  await expect(
    canvas(page).getByRole("heading", { name: "Recovered template heading" }),
  ).toBeVisible();
  expect(creates).toBe(1);
});
