import { expect, test } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce } from "./support/api.ts";
import { uploadEmvbPixel } from "./support/media.ts";
import { unique } from "./support/helpers.ts";

// W-915: a library Image on a published page gets a srcset from the host's image service.
setUpEmvbOnce();

test("W-915: a library Image is published with a srcset the site can serve", async ({
  page,
  request,
}) => {
  const item = await uploadEmvbPixel(request);
  const title = `Responsive ${unique()}`;
  const slug = `responsive-${unique()}`;
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
          {
            id: "imag0001",
            type: "image",
            props: { src: item.url, mediaId: item.id, alt: "Hero", width: 800, height: 600 },
          },
        ],
      },
    },
    slug,
  );
  await publishPage(request, id);
  await page.goto(`/${slug}`);
  const img = page.locator("img[alt='Hero']").first();
  await expect(img).toHaveAttribute("src", item.url);
  const srcset = (await img.getAttribute("srcset")) ?? "";
  expect(srcset, "W-915 srcset").toMatch(/ 640w/);
  expect(srcset, "W-915 srcset").toMatch(/ 1600w/);
  const first = srcset.split(", ")[0]?.split(" ")[0] ?? "";
  expect(first, "W-915 candidate").not.toBe(item.url);
  const response = await request.get(first);
  expect(response.status(), "W-915 candidate served").toBe(200);
  expect(response.headers()["content-type"], "W-915 candidate type").toMatch(/^image\//);
});
