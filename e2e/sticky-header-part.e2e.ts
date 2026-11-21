import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  api,
  createPage,
  createThemePart,
  publishPage,
  publishThemePart,
  setUpEmvbOnce,
} from "./support/api.ts";
import { unique } from "./support/helpers.ts";

// W-1097 (#42): a sticky box in a Header theme part stays at the top of the page while the
// visitor scrolls the whole page, not only while the header itself is on screen.

setUpEmvbOnce();

/** A Header part (Entire site) whose only top-level box is sticky at Top 0. */
async function stickyHeaderPart(request: APIRequestContext, tag: string, hide: boolean) {
  const id = await createThemePart(request, {
    title: `Sticky header ${tag}`,
    partType: "header",
    slug: `sticky-header-${tag}`,
    layout: {
      schemaVersion: 18,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "navb0001",
            type: "container",
            props: {},
            style: {
              position: "sticky",
              top: { value: 0, unit: "px" },
              zIndex: 10,
              backgroundColor: "#ffffff",
              ...(hide ? { motion: { sticky: { hide: true } } } : {}),
            },
            children: [{ id: "link0001", type: "link", props: { text: `Home ${tag}`, href: "/" } }],
          },
        ],
      },
    },
  });
  await publishThemePart(request, id);
  return id;
}

/** A published page tall enough to scroll 1500 px and more. */
async function tallPage(request: APIRequestContext) {
  const slug = `sticky-part-${unique()}`;
  const layout = {
    schemaVersion: 18,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        { id: "text0001", type: "text", props: { text: "Page body" } },
        { id: "spac0001", type: "spacer", props: { height: { value: 4000, unit: "px" } } },
      ],
    },
  };
  await publishPage(request, await createPage(request, "Sticky part page", layout, slug));
  return slug;
}

test("a sticky box in a Header part stays at the top of the viewport (W-1097)", async ({
  page,
  request,
}) => {
  const tag = unique();
  const partId = await stickyHeaderPart(request, tag, false);
  try {
    const slug = await tallPage(request);
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto(`/${slug}`);
    const banner = page.getByRole("banner");
    await expect(banner.getByRole("link", { name: `Home ${tag}` })).toBeVisible();
    const nav = banner.locator(".emvb-e-navb0001");
    await page.evaluate(() => window.scrollTo(0, 1500));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(1500);
    await expect(nav).toBeInViewport();
    expect(Math.round((await nav.boundingBox())?.y ?? -1)).toBe(0);
  } finally {
    // A published header for the whole site would sit on every later spec's pages.
    await api(request, "DELETE", `/_emdash/api/content/emvb_theme_parts/${partId}`);
  }
});

test("a sticky Header part with Hide while scrolling down hides and comes back (W-1097)", async ({
  page,
  request,
}) => {
  const tag = unique();
  const partId = await stickyHeaderPart(request, tag, true);
  try {
    const slug = await tallPage(request);
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto(`/${slug}`);
    const banner = page.getByRole("banner");
    const nav = banner.locator(".emvb-e-navb0001");
    await expect(nav).toBeInViewport();
    await page.mouse.move(600, 400);
    await page.mouse.wheel(0, 1500);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
    await expect(nav).not.toBeInViewport();
    await page.mouse.wheel(0, -200);
    await expect(nav).toBeInViewport();
    // Back at the top of the viewport, far down the page.
    await expect.poll(async () => Math.round((await nav.boundingBox())?.y ?? -1)).toBe(0);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
  } finally {
    await api(request, "DELETE", `/_emdash/api/content/emvb_theme_parts/${partId}`);
  }
});
