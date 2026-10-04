import { expect, test } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce } from "./support/api.ts";
import { unique } from "./support/helpers.ts";

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

test("a grid publishes equal columns and a column span", async ({ page, request }) => {
  const text = `Grid ${unique()}`;
  const slug = `grid-${unique()}`;
  const id = await createPage(
    request,
    text,
    {
      schemaVersion: 10,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "grid0001",
            type: "grid",
            props: { columns: 3 },
            children: [
              {
                id: "head0001",
                type: "heading",
                props: { text, level: 1 },
                style: { gridColumnSpan: 2 },
              },
            ],
          },
        ],
      },
    },
    slug,
  );
  await publishPage(request, id);
  await page.goto(`/${slug}`);
  await expect(page.getByRole("heading", { name: text })).toBeVisible();
  const sheet = (await page.locator("style").allTextContents()).join("\n");
  expect(sheet).toContain("display:grid");
  expect(sheet).toContain("grid-template-columns:repeat(3, minmax(0, 1fr))");
  expect(sheet).toContain("grid-column:span 2");
});
