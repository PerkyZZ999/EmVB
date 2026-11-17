import { expect, test } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce } from "./support/api.ts";
import { unique } from "./support/helpers.ts";

// 1.4 fixes and hardening (PLAN_1.4 B and D), each on a published page in a real browser.

setUpEmvbOnce();

test("a Spacer between two items in a row makes a gap as wide as it is tall (W-1062)", async ({
  page,
  request,
}) => {
  const slug = `fixes-${unique()}`;
  const layout = {
    schemaVersion: 18,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      style: { flexDirection: "row", gap: { value: 0, unit: "px" } },
      children: [
        { id: "text0001", type: "text", props: { text: "Left" } },
        { id: "spac0001", type: "spacer", props: { height: { value: 40, unit: "px" } } },
        { id: "text0002", type: "text", props: { text: "Right" } },
      ],
    },
  };
  const id = await createPage(request, "Spacer row", layout, slug);
  await publishPage(request, id);
  await page.goto(`/${slug}`);
  const box = await page.locator(".emvb-spacer").boundingBox();
  expect(Math.round(box?.width ?? 0)).toBe(40);
  const left = await page.getByText("Left", { exact: true }).boundingBox();
  const right = await page.getByText("Right", { exact: true }).boundingBox();
  expect(Math.round((right?.x ?? 0) - ((left?.x ?? 0) + (left?.width ?? 0)))).toBe(40);
});
