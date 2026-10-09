import { expect, test } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce } from "./support/api.ts";
import { unique } from "./support/helpers.ts";

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

test("an entrance animation is in the published CSS and reduced motion turns it off", async ({
  page,
  request,
}) => {
  const text = `Entrance ${unique()}`;
  const slug = `entrance-${unique()}`;
  const id = await createPage(
    request,
    text,
    {
      schemaVersion: 13,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "head0001",
            type: "heading",
            props: { text, level: 1 },
            style: { entrance: { type: "fade", duration: 400 } },
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
  expect(sheet).toContain("@keyframes emvb-fade{from{opacity:0}to{opacity:1}}");
  expect(sheet).toContain("animation:emvb-fade 400ms ease-out both");
  expect(sheet).toContain("animation:none");
});
