import { expect, test } from "@playwright/test";
import {
  createPage,
  createThemePart,
  publishPage,
  publishThemePart,
  setUpEmvbOnce,
} from "./support/api.ts";
import { canvas, openEditor, unique } from "./support/helpers.ts";

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

test("a synced section shows the part, not its local heading", async ({ page, request }) => {
  const text = `Synced ${unique()}`;
  const partId = await createThemePart(request, {
    title: text,
    partType: "section",
    slug: `sec-${unique()}`,
  });
  await publishThemePart(request, partId);
  const slug = `page-${unique()}`;
  const id = await createPage(
    request,
    "Section page",
    {
      schemaVersion: 14,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "sec00001",
            type: "section",
            props: { partId },
            children: [
              { id: "local001", type: "heading", props: { text: "Local only", level: 1 } },
            ],
          },
        ],
      },
    },
    slug,
  );
  await openEditor(page, id, text);
  await expect(canvas(page).getByRole("heading", { name: "Local only" })).toHaveCount(0);
  await publishPage(request, id);
  await page.goto(`/${slug}`);
  await expect(page.getByRole("heading", { name: text })).toBeVisible();
  await expect(page.getByText("Local only")).toHaveCount(0);
});
