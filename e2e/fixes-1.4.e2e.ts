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
import { canvas, openEditor, unique } from "./support/helpers.ts";
import { uploadEmvbPixel } from "./support/media.ts";

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

/**
 * Runs in the page: mirrored means the x axis is flipped (a negative 2D determinant), at any
 * angle. An animation is paused three quarters through: a spin that replaced the mirror instead
 * of adding to it has turned it back by then (its implicit start is the mirror).
 */
const mirrored = (svg: SVGElement | HTMLElement) => {
  for (const animation of svg.getAnimations()) {
    animation.pause();
    animation.currentTime = 3000;
  }
  const m = new DOMMatrix(getComputedStyle(svg).transform);
  return m.a * m.d - m.b * m.c < 0;
};

test("a Button's arrow and a spinning arrow icon stay mirrored on a right-to-left page (W-1079)", async ({
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
            { id: "butn0001", type: "button", props: { text: "Next step", iconId: "arrow-right" } },
            {
              ...icon("icon0001", "arrow-right", "Spinning next"),
              style: { motion: { icon: { type: "spin", duration: 4000, loop: true } } },
            },
          ],
        },
      ],
    },
  };
  const id = await createPage(request, "RTL button and spin", layout, slug);
  await publishPage(request, id);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`/${slug}`);
  expect(await page.locator(".emvb-button svg").evaluate(mirrored)).toBe(true);
  const spinner = page.getByRole("img", { name: "Spinning next" });
  expect(await spinner.evaluate((svg) => svg.getAnimations().length)).toBe(1);
  expect(await spinner.evaluate(mirrored)).toBe(true);
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

test("a Hotspots picture in a popup and on the page: each marker opens its own note (W-1077)", async ({
  page,
  request,
}) => {
  const tag = unique();
  const title = `Spots ${tag}`;
  const media = await uploadEmvbPixel(request);
  const spots = (marker: string) => ({
    id: "spot0001",
    type: "hotspots",
    props: { src: media.url, alt: "A test picture", width: 1200, height: 600 },
    children: [
      {
        id: "hspt0001",
        type: "hotspot",
        props: { title: marker, text: `${marker} note`, x: 50, y: 50 },
      },
    ],
  });
  const layoutWith = (marker: string) => ({
    schemaVersion: 18,
    root: { id: "root0001", type: "container", props: {}, children: [spots(marker)] },
  });
  const popupId = await createThemePart(request, {
    title,
    partType: "popup",
    slug: `spots-${tag}`,
    layout: layoutWith("Popup wheel"),
    triggers: {
      schemaVersion: 1,
      open: [{ type: "page_load" }],
      advanced: { urlParams: [{ name: "spots", value: tag }] },
    },
  });
  try {
    await publishThemePart(request, popupId);
    const slug = `fixes-${unique()}`;
    await publishPage(
      request,
      await createPage(request, "Spots page", layoutWith("Page wheel"), slug),
    );
    await page.goto(`/${slug}?spots=${tag}`);
    // A popup without a heading is named "Popup"; this one is the dialog holding its marker.
    const dialog = page
      .getByRole("dialog")
      .filter({ has: page.getByRole("button", { name: "Popup wheel" }) });
    await expect(dialog).toBeVisible();
    const duplicates = await page.evaluate(() => {
      const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
      return ids.filter((id, i) => ids.indexOf(id) !== i);
    });
    expect(duplicates).toEqual([]);
    await dialog.getByRole("button", { name: "Popup wheel" }).click();
    await expect(dialog.getByText("Popup wheel note")).toBeVisible();
    await expect(page.getByText("Page wheel note")).toBeHidden();
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

const px = (value: number) => ({ value, unit: "px" });

test("a Spacer's phone height applies in a column, and in a row on a phone (W-1062)", async ({
  page,
  request,
}) => {
  const slug = `fixes-${unique()}`;
  const spacer = (id: string) => ({
    id,
    type: "spacer",
    props: { height: px(96) },
    devices: { mobile: { height: px(8) } },
  });
  const layout = {
    schemaVersion: 18,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        spacer("spac0001"),
        {
          id: "cont0001",
          type: "container",
          props: {},
          style: { flexDirection: "row", gap: px(0) },
          children: [spacer("spac0002")],
        },
      ],
    },
  };
  const id = await createPage(request, "Spacer devices", layout, slug);
  await publishPage(request, id);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`/${slug}`);
  const column = await page.locator(".emvb-e-spac0001").boundingBox();
  expect(Math.round(column?.height ?? 0)).toBe(8);
  const row = await page.locator(".emvb-e-spac0002").boundingBox();
  expect(Math.round(row?.width ?? 0)).toBe(8);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect
    .poll(async () =>
      Math.round((await page.locator(".emvb-e-spac0001").boundingBox())?.height ?? 0),
    )
    .toBe(96);
  const wide = await page.locator(".emvb-e-spac0002").boundingBox();
  expect(Math.round(wide?.width ?? 0)).toBe(96);
});

const linkButton = (id: string, text: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "button",
  props: { text, href: "#top" },
  ...extra,
});

test("dismissing an Alert skips a button hidden on phones, so focus doesn't fall to the page (W-1054)", async ({
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
          id: "alrt0001",
          type: "alert",
          props: { variant: "info", text: "Heads up.", dismissible: true },
        },
        linkButton("butn0001", "Desktop only", { hiddenOn: ["mobile"] }),
        linkButton("butn0002", "Everywhere"),
      ],
    },
  };
  await publishPage(request, await createPage(request, "Alert hidden next", layout, slug));
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`/${slug}`);
  await page.getByRole("button", { name: "Dismiss" }).press("Enter");
  await expect(page.getByRole("link", { name: "Everywhere" })).toBeFocused();
});

test("hiding on scroll follows the device, and a bar at the bottom slides down (W-1070)", async ({
  page,
  request,
}) => {
  const slug = `sticky-device-${unique()}`;
  const layout = {
    schemaVersion: 18,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        {
          id: "head0002",
          type: "container",
          props: {},
          // Hides on phones only.
          style: { position: "sticky", top: { value: 0, unit: "px" }, backgroundColor: "#fff" },
          devices: { mobile: { motion: { sticky: { hide: true } } } },
          children: [{ id: "link0001", type: "link", props: { text: "Home", href: "/" } }],
        },
        { id: "spac0001", type: "spacer", props: { height: { value: 3000, unit: "px" } } },
        {
          id: "foot0002",
          type: "container",
          props: {},
          style: {
            position: "fixed",
            bottom: { value: 0, unit: "px" },
            motion: {
              sticky: { hide: true },
              transition: { property: "opacity", duration: 300, easing: "ease" },
            },
          },
          children: [{ id: "link0002", type: "link", props: { text: "Top", href: "#" } }],
        },
      ],
    },
  };
  const id = await createPage(request, "Sticky devices", layout, slug);
  await publishPage(request, id);
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto(`/${slug}`);
  const header = page.locator(".emvb-e-head0002");
  const bar = page.locator(".emvb-e-foot0002");
  const ownTransition = await bar.evaluate((el) => getComputedStyle(el).transitionProperty);
  await page.mouse.wheel(0, 400);
  await expect(bar).toHaveAttribute("data-emvb-away", "");
  await expect
    .poll(() => bar.evaluate((el) => el.getBoundingClientRect().top))
    .toBeGreaterThanOrEqual(800);
  expect(await bar.evaluate((el) => getComputedStyle(el).transitionProperty)).toBe(ownTransition);
  // On Desktop the header's hiding is off.
  await expect(header).not.toHaveAttribute("data-emvb-away");
  await expect(header).toBeInViewport();

  await page.setViewportSize({ width: 390, height: 800 });
  await page.mouse.wheel(0, -100);
  await page.mouse.wheel(0, 400);
  await expect(header).toHaveAttribute("data-emvb-away", "");
  await expect(header).not.toBeInViewport();
});

test("a panel from the left opens at the left on a right-to-left page, its button says it is open (W-1071)", async ({
  page,
  request,
}) => {
  const tag = unique();
  const title = `Side ${tag}`;
  const panelId = await createThemePart(request, {
    title,
    partType: "popup",
    slug: `side-${tag}`,
    triggers: {
      schemaVersion: 1,
      open: [{ type: "click", selector: `#side-${tag}` }],
      advanced: {},
      panel: { edge: "left", size: "narrow" },
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
          { id: "butn0001", type: "button", props: { text: "Side" }, htmlId: `side-${tag}` },
        ],
      },
    };
    await publishPage(request, await createPage(request, "RTL panel page", layout, slug));
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/${slug}`);
    await page.evaluate(() => {
      document.documentElement.dir = "rtl";
    });
    const dialog = page.getByRole("dialog", { name: title });
    const opener = page.locator(`#side-${tag}`);
    await expect(opener).toHaveAttribute("aria-haspopup", "dialog");
    await expect(opener).toHaveAttribute("aria-expanded", "false");
    await opener.click();
    await expect(dialog).toBeVisible();
    await expect(opener).toHaveAttribute("aria-expanded", "true");
    const box = await dialog.boundingBox();
    expect(Math.round(box?.x ?? -1)).toBe(0);
    expect(Math.round(box?.width ?? 0)).toBe(320);
    await page.keyboard.press("Escape");
    await expect(opener).toHaveAttribute("aria-expanded", "false");
  } finally {
    await api(request, "DELETE", `/_emdash/api/content/emvb_theme_parts/${panelId}`);
  }
});

test("the editor canvas shows a Theme toggle (W-1067)", async ({ page, request }) => {
  const text = `Toggle ${unique()}`;
  const layout = {
    schemaVersion: 18,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        { id: "head0001", type: "heading", props: { text, level: 1 } },
        { id: "thme0001", type: "theme-toggle", props: {} },
      ],
    },
  };
  const id = await createPage(request, text, layout, `toggle-${unique()}`);
  await openEditor(page, id, text);
  await expect(canvas(page).getByRole("button", { name: "Dark mode" })).toBeVisible();
});

test("a saved light or dark choice holds on a page without a Theme toggle (W-1067)", async ({
  page,
  request,
}) => {
  const tag = unique()
    .replace(/[^a-z0-9]/g, "")
    .slice(-8);
  const name = `Boot test ${tag}`;
  const id = `boot-${tag}`;
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
    const slug = `boot-${unique()}`;
    const layout = {
      schemaVersion: 18,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        style: { backgroundColor: { var: id } },
        children: [{ id: "head0001", type: "heading", props: { text: "No toggle", level: 1 } }],
      },
    };
    await publishPage(request, await createPage(request, "Boot", layout, slug));
    await page.emulateMedia({ colorScheme: "dark" });
    await page.addInitScript(() => localStorage.setItem("emvb-theme", "light"));
    await page.goto(`/${slug}`, { waitUntil: "domcontentloaded" });
    const root = page.locator(".emvb-root").first();
    expect(await root.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      "rgb(255, 255, 255)",
    );
  } finally {
    await removeColorsNamed(request, name);
  }
});
