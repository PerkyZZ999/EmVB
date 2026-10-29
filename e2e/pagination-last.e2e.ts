import { homedir } from "node:os";
import { expect, test } from "@playwright/test";
import { createPage, getPage, setUpEmvbOnce } from "./support/api.ts";
import { canvas, openEditor, overlay, saveDraft, unique } from "./support/helpers.ts";

// W-916: the Pagination element's Last link, set in the editor and shown on the canvas sample.
setUpEmvbOnce();
const SHOTS = `${homedir()}/agent-tools/emvb-ui`;

test("W-916: Show Last link adds a Last link and its text field", async ({
  page,
  request,
}, info) => {
  const title = `Pager ${unique()}`;
  const id = await createPage(
    request,
    title,
    {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "head0001", type: "heading", props: { text: title, level: 2 } },
          { id: "pagi0001", type: "pagination", props: {} },
        ],
      },
    },
    `pager-${unique()}`,
  );
  await openEditor(page, id, title);
  const pager = canvas(page).locator('[data-emvb-id="pagi0001"]');
  await expect(pager.locator(".emvb-pagination-last")).toHaveCount(0);
  await pager.click({ position: { x: 2, y: 2 } });
  const editor = overlay(page);
  await expect(editor.getByLabel("Last text")).toHaveCount(0);
  await editor.getByRole("switch", { name: "Show Last link" }).click();
  await expect(pager.locator(".emvb-pagination-last")).toHaveText("Last");
  await editor.getByLabel("Last text").fill("Final");
  await expect(pager.locator(".emvb-pagination-last")).toHaveText("Final");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({
      path: `${SHOTS}/w916-pagination-last-${info.project.name}-${scheme}.png`,
    });
  }
  await page.emulateMedia({ colorScheme: "light" });
  await saveDraft(page);
  const stored = JSON.stringify((await getPage(request, id)).data["layout"]);
  expect(stored, "W-916 saved").toContain('"showLast":true');
  expect(stored, "W-916 saved").toContain('"lastText":"Final"');
});
