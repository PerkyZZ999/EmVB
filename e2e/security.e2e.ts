import { expect, test } from "@playwright/test";
import { XSS_CORPUS } from "../packages/emvb/test/fixtures/xss.ts";
import { createPage, publishPage, setUpEmvbOnce } from "./support/api.ts";
import { unique } from "./support/helpers.ts";

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

test("XSS corpus strings stay inert on the published page (W-042)", async ({ page, request }) => {
  const slug = `xss-${unique()}`;
  const sample = XSS_CORPUS.slice(0, 8);
  const children = sample.flatMap((payload, i) => [
    {
      id: `h${String(i).padStart(7, "0")}`,
      type: "heading" as const,
      props: { text: payload, level: 2 as const },
    },
    {
      id: `t${String(i).padStart(7, "0")}`,
      type: "text" as const,
      props: { text: payload },
    },
  ]);
  const layout = {
    schemaVersion: 4 as const,
    root: {
      id: "root0001",
      type: "container" as const,
      props: {},
      children,
    },
  };
  const id = await createPage(request, "XSS corpus", layout, slug);
  await publishPage(request, id);

  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });

  await page.goto(`/${slug}`);
  await expect(page.locator(".emvb-root")).toBeVisible();
  const headings = page.locator("h2.emvb-heading");
  await expect(headings).toHaveCount(sample.length);
  for (let i = 0; i < sample.length; i++) {
    const expected = sample[i];
    expect(expected).toBeTruthy();
    if (!expected) throw new Error("missing corpus entry");
    await expect(headings.nth(i)).toHaveText(expected);
  }
  expect(await page.locator(".emvb-root script").count()).toBe(0);
  expect(await page.locator('.emvb-root img[src="x"]').count()).toBe(0);
  expect(dialogs).toEqual([]);
});
