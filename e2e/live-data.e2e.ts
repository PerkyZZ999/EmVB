import { expect, test } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce } from "./support/api.ts";
import { unique } from "./support/helpers.ts";

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

const loop = (id: string, collection: string, empty: string) => ({
  id,
  type: "loop",
  props: { collection, limit: 2, order: "title" },
  children: [
    { id: `${id}t`, type: "post-title", props: { level: 2 } },
    {
      id: `${id}e`,
      type: "loop-empty",
      props: {},
      children: [{ id: `${id}x`, type: "text", props: { text: empty } }],
    },
  ],
});

test("bindings read URL parameters and site settings, and Loops list real entries (W-307, W-308)", async ({
  request,
  page,
}) => {
  const tag = unique();
  const slug = `live-${tag}`;
  const id = await createPage(
    request,
    `Live ${tag}`,
    {
      schemaVersion: 14,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "head0001",
            type: "heading",
            props: { text: "Hello Friend", level: 1 },
            bind: { text: { source: "param", key: "name" } },
          },
          {
            id: "text0001",
            type: "text",
            props: { text: "Typed site title" },
            bind: { text: { source: "site", key: "title" } },
          },
          loop("loop0001", "posts", `No posts ${tag}`),
          loop("loop0002", "nothing_here", `Nothing yet ${tag}`),
        ],
      },
    },
    slug,
  );
  await publishPage(request, id);

  await page.goto(`/${slug}?name=${encodeURIComponent("<b>Ada</b>")}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("<b>Ada</b>");
  await expect(page.getByText("Typed site title")).toHaveCount(0);
  // The demo seeds posts: the first Loop lists up to two of them, the other one is empty.
  const items = page.locator(".emvb-loop-item");
  await expect(page.getByText(`No posts ${tag}`)).toHaveCount(0);
  const listed = await items.count();
  expect(listed).toBeGreaterThan(0);
  expect(listed).toBeLessThanOrEqual(2);
  await expect(page.getByText(`Nothing yet ${tag}`)).toBeVisible();

  await page.goto(`/${slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hello Friend");
});
