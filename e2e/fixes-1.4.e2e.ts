import { expect, test } from "@playwright/test";
import {
  api,
  createPage,
  createThemePart,
  publishPage,
  publishThemePart,
  setUpEmvbOnce,
} from "./support/api.ts";
import { unique } from "./support/helpers.ts";

// 1.4 fixes and hardening (PLAN_1.4 B and D), each on a published page in a real browser.

setUpEmvbOnce();

const icon = (id: string, iconId: string, title: string) => ({
  id,
  type: "icon",
  props: { iconId, title },
});

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

test("an arrow icon points the other way on a right-to-left page, a star doesn't (W-1079)", async ({
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
      children: [
        {
          id: "boxr0001",
          type: "div-block",
          props: {},
          dir: "rtl",
          children: [
            icon("icon0001", "arrow-right", "Next"),
            icon("icon0002", "star", "Favourite"),
          ],
        },
        icon("icon0003", "arrow-right", "Forward"),
      ],
    },
  };
  const id = await createPage(request, "RTL icons", layout, slug);
  await publishPage(request, id);
  await page.goto(`/${slug}`);
  const transform = (name: string) =>
    page.getByRole("img", { name }).evaluate((svg) => getComputedStyle(svg).transform);
  expect(await transform("Next")).toBe("matrix(-1, 0, 0, 1, 0, 0)");
  expect(await transform("Favourite")).toBe("none");
  expect(await transform("Forward")).toBe("none");
});

test("a popup with an address rule opens only on addresses that have it (W-1081)", async ({
  page,
  request,
}) => {
  const tag = unique();
  const title = `Promo ${tag}`;
  const popupId = await createThemePart(request, {
    title,
    partType: "popup",
    slug: `promo-${tag}`,
    triggers: {
      schemaVersion: 1,
      open: [{ type: "page_load" }],
      advanced: { urlParams: [{ name: "promo", value: tag }], from: "2020-01-01T00:00Z" },
    },
  });
  try {
    await publishThemePart(request, popupId);
    const slug = `fixes-${unique()}`;
    const layout = {
      schemaVersion: 18,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [{ id: "head0001", type: "heading", props: { text: "Home", level: 1 } }],
      },
    };
    await publishPage(request, await createPage(request, "Promo page", layout, slug));
    const dialog = page.getByRole("dialog", { name: title });
    await page.goto(`/${slug}`);
    await page.waitForLoadState("load");
    await expect(dialog).toBeHidden();
    await page.goto(`/${slug}?promo=${tag}`);
    await expect(dialog).toBeVisible();
  } finally {
    // A published popup for the whole site would sit on every later spec's pages.
    await api(request, "DELETE", `/_emdash/api/content/emvb_theme_parts/${popupId}`);
  }
});
