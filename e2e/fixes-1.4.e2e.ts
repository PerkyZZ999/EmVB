import { expect, test } from "@playwright/test";
import {
  api,
  createPage,
  createThemePart,
  publishPage,
  publishThemePart,
  setUpEmvbOnce,
} from "./support/api.ts";
import { loadDraft, publishStyles, removeColorsNamed, saveDesign } from "./support/design.ts";
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

test("a sticky header takes its scrolled background and hides while scrolling down (W-1070)", async ({
  page,
  request,
}) => {
  const slug = `sticky-${unique()}`;
  const layout = {
    schemaVersion: 18,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        {
          id: "head0001",
          type: "container",
          props: {},
          style: {
            position: "sticky",
            top: { value: 0, unit: "px" },
            backgroundColor: "#ffffff",
            motion: { sticky: { background: "#112233", hide: true, distance: 100 } },
          },
          children: [{ id: "menu0001", type: "link", props: { text: "Home", href: "/" } }],
        },
        { id: "spac0001", type: "spacer", props: { height: { value: 3000, unit: "px" } } },
      ],
    },
  };
  const id = await createPage(request, "Sticky", layout, slug);
  await publishPage(request, id);
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto(`/${slug}`);
  const header = page.locator(".emvb-e-head0001");
  const background = () => header.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await background()).toBe("rgb(255, 255, 255)");
  await page.mouse.wheel(0, 400);
  await expect.poll(background).toBe("rgb(17, 34, 51)");
  await expect(header).toHaveAttribute("data-emvb-away", "");
  await expect(header).not.toBeInViewport();
  await page.mouse.wheel(0, -100);
  await expect(header).not.toHaveAttribute("data-emvb-away");
  await expect(header).toBeInViewport();
});

test("a popup shown as a panel from the right opens at that edge at full height (W-1071)", async ({
  page,
  request,
}) => {
  const tag = unique();
  const title = `Menu ${tag}`;
  const panelId = await createThemePart(request, {
    title,
    partType: "popup",
    slug: `panel-${tag}`,
    triggers: {
      schemaVersion: 1,
      open: [{ type: "click", selector: `#open-${tag}` }],
      advanced: {},
      panel: { edge: "right", size: "narrow" },
    },
  });
  try {
    await publishThemePart(request, panelId);
    const slug = `fixes-${unique()}`;
    const layout = {
      schemaVersion: 18,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "butn0001", type: "button", props: { text: "Menu" }, htmlId: `open-${tag}` },
        ],
      },
    };
    await publishPage(request, await createPage(request, "Panel page", layout, slug));
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/${slug}`);
    const dialog = page.getByRole("dialog", { name: title });
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(Math.round((box?.x ?? 0) + (box?.width ?? 0))).toBe(1200);
    expect(Math.round(box?.height ?? 0)).toBe(800);
    expect(Math.round(box?.width ?? 0)).toBe(320);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  } finally {
    await api(request, "DELETE", `/_emdash/api/content/emvb_theme_parts/${panelId}`);
  }
});

test("a colour's dark value follows the system, and a Theme toggle switches and remembers (W-1067)", async ({
  page,
  request,
}) => {
  const tag = unique()
    .replace(/[^a-z0-9]/g, "")
    .slice(-8);
  const name = `Dark test ${tag}`;
  const id = `dark-${tag}`;
  const draft = await loadDraft(request);
  const colors = [
    ...draft.design.variables.colors,
    { id, name, value: "#ffffff", dark: "#0b1220" },
  ];
  await saveDesign(
    request,
    { ...draft.design, variables: { ...draft.design.variables, colors } },
    draft.revision,
  );
  await publishStyles(request, draft.publishedRevision);
  try {
    const slug = `dark-${unique()}`;
    const layout = {
      schemaVersion: 18,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        style: { backgroundColor: { var: id } },
        children: [{ id: "thme0001", type: "theme-toggle", props: {} }],
      },
    };
    await publishPage(request, await createPage(request, "Dark", layout, slug));
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(`/${slug}`);
    const root = page.locator(".emvb-root").first();
    const background = () => root.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await background()).toBe("rgb(11, 18, 32)");
    const toggle = page.getByRole("button", { name: "Dark mode" });
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await toggle.click();
    await expect.poll(background).toBe("rgb(255, 255, 255)");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await page.reload();
    await expect.poll(background).toBe("rgb(255, 255, 255)");
  } finally {
    await removeColorsNamed(request, name);
  }
});
