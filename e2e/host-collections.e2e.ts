import { homedir } from "node:os";
import { expect, test } from "@playwright/test";
import { setUpEmvbOnce } from "./support/api.ts";

// W-913: the Host collections setup page. A made-up collection is served by route mocks, so the
// demo schemas aren't changed; `pages` is the demos' real host collection.
setUpEmvbOnce();
const SHOTS = `${homedir()}/agent-tools/emvb-ui`;

test("W-913: lists host collections, adds the canvas field and shows the canvasCollections snippet", async ({
  page,
}, info) => {
  let added = false;
  const posted: unknown[] = [];
  await page.route("**/_emdash/api/schema/collections", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = (await response.json()) as { data: { items: unknown[] } };
    body.data.items.push({ slug: "qa_notes", label: "QA notes", hidden: false });
    await route.fulfill({ response, json: body });
  });
  await page.route("**/_emdash/api/schema/collections/qa_notes?includeFields=true", (route) =>
    route.fulfill({
      json: {
        data: {
          item: {
            slug: "qa_notes",
            fields: [
              { slug: "title", type: "string" },
              ...(added ? [{ slug: "canvas", type: "json", widget: "emvb:canvas" }] : []),
            ],
          },
        },
      },
    }),
  );
  await page.route("**/_emdash/api/schema/collections/qa_notes/fields", async (route) => {
    posted.push(route.request().postDataJSON());
    added = true;
    await route.fulfill({ status: 201, json: { data: { item: {} } } });
  });

  await page.goto("/_emdash/admin/plugins/emvb/collections");
  await expect(page.getByRole("heading", { name: "Host collections", level: 1 })).toBeVisible();
  const pagesRow = page.locator('[data-emvb-collection="pages"]');
  await expect(pagesRow).toContainText("Has canvas");
  await expect(pagesRow).toContainText("Yes");
  const qaRow = page.locator('[data-emvb-collection="qa_notes"]');
  await expect(qaRow).toContainText("No canvas field");
  await expect(page.locator('[data-emvb-collection^="emvb_"]')).toHaveCount(0);
  const snippet = page.locator('[data-emvb-snippet="canvas-collections"]');
  await expect(snippet).toContainText('canvasCollections: ["pages"]');
  await expect(snippet).toContainText('canvasStyles: ["/site.css"]');
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({
      path: `${SHOTS}/w913-host-collections-${info.project.name}-${scheme}.png`,
      fullPage: true,
    });
  }
  await page.emulateMedia({ colorScheme: "light" });

  await qaRow.getByRole("button", { name: "Add canvas field to QA notes" }).click();
  await expect(qaRow).toContainText("Has canvas");
  await expect(qaRow).toContainText("Not yet");
  expect(posted).toEqual([
    { slug: "canvas", label: "Canvas", type: "json", widget: "emvb:canvas", validation: null },
  ]);
  await expect(snippet).toContainText('canvasCollections: ["pages","qa_notes"]');
  await expect(page.locator("[data-emvb-unlisted]")).toContainText("QA notes has the field");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({
      path: `${SHOTS}/w913-host-collections-added-${info.project.name}-${scheme}.png`,
      fullPage: true,
    });
  }
});
