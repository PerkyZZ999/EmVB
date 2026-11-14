import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { canvas, openEditor, openLayers, overlay, saveDraft, unique } from "./support/helpers.ts";

// Each 1.3 marketing widget is added from the Add panel, set up in its settings, saved, and
// published with no EmVB script unless it opts in.

setUpEmvbOnce();

type Stored = { root: { children: { type: string; props: Record<string, unknown> }[] } };

const startPage = (title: string) => ({
  schemaVersion: 18,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "head0001", type: "heading", props: { text: title, level: 1 } }],
  },
});

/** A new page open in the editor with the page root selected and the Add tab showing. */
async function addTab(page: Page, request: APIRequestContext, title: string) {
  const slug = `marketing-${unique()}`;
  const id = await createPage(request, title, startPage(title), slug);
  await openEditor(page, id, title);
  await openLayers(page);
  await overlay(page).locator('[data-emvb-layer="root0001"] .emvb-layer-select').click();
  await overlay(page).getByRole("tab", { name: "Add" }).click();
  return { id, slug };
}

/** Sets a text field in the element panel and leaves it, which commits it. */
async function setField(page: Page, label: string, value: string) {
  const field = overlay(page).getByLabel(label, { exact: true });
  await field.fill(value);
  await field.blur();
}

test("a Counter is set to 2,500 sites and counts up on the page, but not under reduced motion (W-1038)", async ({
  page,
  request,
  browser,
}) => {
  const { id, slug } = await addTab(page, request, "Counters");
  await overlay(page).locator('[data-emvb-add-tile="counter"]').click();
  await expect(overlay(page).locator("h2.emvb-panel-title")).toHaveText("Counter");
  const value = canvas(page).locator(".emvb-counter-value");
  await expect(value).toHaveText("1,200");

  await setField(page, "Number", "2500");
  await setField(page, "Title", "Sites built");
  await expect(value).toHaveText("2,500");
  await expect(canvas(page).locator(".emvb-counter-title")).toHaveText("Sites built");
  await overlay(page).getByRole("switch", { name: "Count up when scrolled into view" }).click();
  await setField(page, "Count-up time (ms)", "5000");
  // The editor shows the final number: the count-up runs on the public page only.
  await expect(value).toHaveText("2,500");

  await saveDraft(page);
  const stored = await storedLayout<Stored>(request, id);
  expect(stored.root.children[1]).toMatchObject({
    type: "counter",
    props: { value: 2500, title: "Sites built", countUp: true, duration: 5000 },
  });

  await publishPage(request, id);
  await page.goto(`/${slug}`);
  const live = page.locator(".emvb-counter-value");
  // It starts below the final number, which screen readers get from a hidden copy meanwhile.
  await expect(live).not.toHaveText("2,500");
  await expect(live).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".emvb-counter-sr")).toHaveText("2,500");
  await expect(live).toHaveText("2,500", { timeout: 10_000 });
  await expect(live).not.toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".emvb-counter-sr")).toHaveCount(0);
  await expect(page.locator(".emvb-counter-number")).toHaveText("2,500+");

  const reduced = await browser.newContext({ reducedMotion: "reduce" });
  try {
    const still = await reduced.newPage();
    await still.goto(new URL(`/${slug}`, page.url()).toString());
    await still.waitForLoadState("load");
    await expect(still.locator(".emvb-counter-value")).toHaveText("2,500");
    await expect(still.locator(".emvb-counter-sr")).toHaveCount(0);
  } finally {
    await reduced.close();
  }
});

test("a Counter without count-up publishes as text with no EmVB script (W-1038)", async ({
  page,
  request,
}) => {
  const slug = `marketing-${unique()}`;
  const layout = startPage("Plain counter");
  layout.root.children.push({
    id: "cntr0001",
    type: "counter",
    props: { value: 42, prefix: "$", title: "Raised" },
  } as never);
  const id = await createPage(request, "Plain counter", layout, slug);
  await publishPage(request, id);
  await page.goto(`/${slug}`);
  await expect(page.locator(".emvb-counter-number")).toHaveText("$42");
  await expect(page.locator(".emvb-counter-title")).toHaveText("Raised");
  expect(await page.locator("script[src*='emvb'], script[data-emvb]").count()).toBe(0);
});

test("a Progress bar is set to 3 of 4 as a task and publishes as a named progress bar with no script (W-1039)", async ({
  page,
  request,
}) => {
  const { id, slug } = await addTab(page, request, "Progress");
  await overlay(page).locator('[data-emvb-add-tile="progress"]').click();
  await expect(overlay(page).locator("h2.emvb-panel-title")).toHaveText("Progress bar");
  const fill = canvas(page).locator(".emvb-progress-fill");
  await expect(fill).toHaveAttribute("width", "75%");

  await setField(page, "Title", "Setup");
  await setField(page, "Maximum", "4");
  await setField(page, "Value", "3");
  // Value reads its highest number from Maximum.
  await setField(page, "Value", "5");
  await expect(overlay(page).getByText("Enter a number from 0 up to the maximum")).toBeVisible();
  await setField(page, "Value", "3");
  await overlay(page).getByLabel("Meaning").click();
  await page.getByRole("option", { name: "How far a task has got" }).click();
  await expect(canvas(page).locator(".emvb-progress-bar")).toHaveAttribute("role", "progressbar");

  await saveDraft(page);
  const stored = await storedLayout<Stored>(request, id);
  expect(stored.root.children[1]).toMatchObject({
    type: "progress",
    props: { value: 3, max: 4, label: "Setup", kind: "progressbar" },
  });

  await publishPage(request, id);
  await page.goto(`/${slug}`);
  const bar = page.getByRole("progressbar", { name: "Setup" });
  await expect(bar).toHaveAttribute("aria-valuetext", "75%");
  await expect(page.locator(".emvb-progress-value")).toHaveText("75%");
  const widths = await page.locator(".emvb-progress-svg").evaluate((svg) => {
    const [track, done] = [...svg.querySelectorAll("rect")].map(
      (r) => r.getBoundingClientRect().width,
    );
    return Math.round(((done ?? 0) / (track ?? 1)) * 100);
  });
  expect(widths).toBe(75);
  expect(await page.locator("script[src*='emvb'], script[data-emvb]").count()).toBe(0);
});

test("a Countdown is set a day and a half ahead, ticks on the page, pauses, and ends as a link (W-1040)", async ({
  page,
  request,
}) => {
  const { id, slug } = await addTab(page, request, "Countdowns");
  await overlay(page).locator('[data-emvb-add-tile="countdown"]').click();
  await expect(overlay(page).locator("h2.emvb-panel-title")).toHaveText("Countdown");
  const soon = new Date(Date.now() + 36 * 3600 * 1000);
  soon.setUTCSeconds(0, 0);
  const target = `${soon.toISOString().slice(0, 16)}Z`;
  const ended = `${new Date(Date.now() - 60_000).toISOString().slice(0, 16)}Z`;
  await setField(page, "Ends at", target);
  await setField(page, "Title", "Launch sale");
  await expect(canvas(page).locator(".emvb-countdown time")).toHaveAttribute("datetime", target);
  // The editor has no script: the clock stays hidden there.
  await expect(canvas(page).locator(".emvb-countdown-clock")).toBeHidden();

  await saveDraft(page);
  const stored = await storedLayout<Stored>(request, id);
  expect(stored.root.children[1]).toMatchObject({
    type: "countdown",
    props: { target, title: "Launch sale", ticking: true },
  });

  await publishPage(request, id);
  await page.goto(`/${slug}`);
  const clock = page.locator(".emvb-countdown-clock");
  await expect(clock).toBeVisible();
  await expect(page.locator('.emvb-countdown-num[data-unit="days"]')).toHaveText("01");
  const seconds = page.locator('.emvb-countdown-num[data-unit="seconds"]');
  const first = await seconds.textContent();
  await expect(seconds).not.toHaveText(first ?? "", { timeout: 3000 });
  // Screen readers get the sentence with the date, not the ticking numbers.
  await expect(page.locator(".emvb-countdown-units")).toHaveAttribute("aria-hidden", "true");
  const pause = page.getByRole("button", { name: "Pause" });
  await pause.click();
  await expect(pause).toHaveAttribute("aria-pressed", "true");
  const paused = await seconds.textContent();
  await page.waitForTimeout(1500);
  await expect(seconds).toHaveText(paused ?? "");

  // A target in the past ends at once: the clock goes, the ended text shows as a link.
  const layout = startPage("Ended");
  layout.root.children.push({
    id: "cdwn0001",
    type: "countdown",
    props: {
      target: ended,
      ticking: true,
      expired: "link",
      expiredText: "See what's on now",
      expiredHref: "/",
    },
  } as never);
  const endedSlug = `marketing-${unique()}`;
  await publishPage(request, await createPage(request, "Ended", layout, endedSlug));
  await page.goto(`/${endedSlug}`);
  await expect(page.getByRole("link", { name: "See what's on now" })).toBeVisible();
  await expect(page.locator(".emvb-countdown-clock")).toBeHidden();
});

test("a Map is set to Google Maps with a map on request; the page asks Google for nothing until Show the map (W-1041)", async ({
  page,
  request,
}) => {
  const { id, slug } = await addTab(page, request, "Maps");
  await overlay(page).locator('[data-emvb-add-tile="map"]').click();
  await expect(overlay(page).locator("h2.emvb-panel-title")).toHaveText("Map");
  await expect(canvas(page).locator(".emvb-map-link")).toHaveText("Open in OpenStreetMap");
  await overlay(page).getByLabel("Map service").click();
  await page.getByRole("option", { name: "Google Maps" }).click();
  await expect(canvas(page).locator(".emvb-map-link")).toHaveText("Open in Google Maps");
  await overlay(page)
    .getByRole("switch", { name: "Visitors can load the map on the page" })
    .click();
  // No map in the editor either: the button only works on the public page.
  await expect(canvas(page).locator(".emvb-map-load")).toBeHidden();
  await expect(canvas(page).locator("iframe")).toHaveCount(0);

  await saveDraft(page);
  const stored = await storedLayout<Stored>(request, id);
  expect(stored.root.children[1]).toMatchObject({
    type: "map",
    props: { provider: "google", embed: true },
  });

  await publishPage(request, id);
  const asked: string[] = [];
  // The map service is never really contacted by the test.
  await page.route(/https:\/\/www\.google\.com\//, (route) => {
    asked.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/html", body: "<p>map</p>" });
  });
  await page.goto(`/${slug}`);
  await expect(page.getByRole("link", { name: "Open in Google Maps" })).toHaveAttribute(
    "href",
    /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=48\.8584,2\.2945$/,
  );
  const show = page.getByRole("button", { name: "Show the map" });
  await expect(show).toBeVisible();
  expect(asked).toEqual([]);
  await show.click();
  const frame = page.locator("iframe[title='Map of Tour Eiffel, Paris']");
  await expect(frame).toBeVisible();
  await expect(frame).toBeFocused();
  await expect.poll(() => asked.length).toBeGreaterThan(0);
});

test("a Price table is put on sale with one more feature and publishes as a plan card with a working button (W-1042)", async ({
  page,
  request,
}) => {
  const { id, slug } = await addTab(page, request, "Plans");
  await overlay(page).locator('[data-emvb-add-tile="price-table"]').click();
  await expect(overlay(page).locator("h2.emvb-panel-title")).toHaveText("Price table");
  const card = canvas(page).locator(".emvb-price-table");
  await expect(card).toHaveClass(/emvb-price-table-featured/);

  await setField(page, "Regular price (on sale)", "49");
  const included = overlay(page).getByLabel("Included", { exact: true });
  await included.fill("Unlimited pages\nPriority support\nAnalytics");
  await included.blur();
  await expect(card.locator(".emvb-price-table-yes")).toHaveCount(3);
  await expect(card.locator(".emvb-price-table-regular")).toContainText("$49");

  await saveDraft(page);
  const stored = await storedLayout<Stored>(request, id);
  expect(stored.root.children[1]).toMatchObject({
    type: "price-table",
    props: { regularPrice: "49", features: ["Unlimited pages", "Priority support", "Analytics"] },
  });

  await publishPage(request, id);
  await page.goto(`/${slug}`);
  await expect(page.getByRole("heading", { name: "Pro", level: 3 })).toBeVisible();
  await expect(page.locator(".emvb-price-table-ribbon")).toHaveText("Featured");
  await expect(page.locator(".emvb-price-table-price")).toContainText("Regular price: $49");
  await expect(
    page.getByRole("listitem").filter({ hasText: "Not included: Custom domain" }),
  ).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Choose Pro" })).toHaveAttribute("href", "/signup");
  // The ribbon sits on the card's top edge, not inside its text.
  const [ribbon, box] = await Promise.all([
    page.locator(".emvb-price-table-ribbon").boundingBox(),
    page.locator(".emvb-price-table").boundingBox(),
  ]);
  expect(Math.abs((ribbon?.y ?? 0) + (ribbon?.height ?? 0) / 2 - (box?.y ?? 99))).toBeLessThan(3);
  expect(await page.locator("script[src*='emvb'], script[data-emvb]").count()).toBe(0);
});

test("a Price list starts with three rows, gets a fourth, and publishes as a list with dotted leaders (W-1043)", async ({
  page,
  request,
}) => {
  const { id, slug } = await addTab(page, request, "Menu");
  await overlay(page).locator('[data-emvb-add-tile="price-list"]').click();
  await expect(overlay(page).locator("h2.emvb-panel-title")).toHaveText("Price list");
  const rows = canvas(page).locator(".emvb-price-list-item");
  await expect(rows).toHaveCount(3);
  await setField(page, "List name", "Coffee");
  await overlay(page).getByRole("button", { name: "Add item" }).click();
  await expect(rows).toHaveCount(4);
  await setField(page, "Item 4 title", "Mocha");
  await expect(rows.nth(3).locator(".emvb-price-list-title")).toHaveText("Mocha");

  await saveDraft(page);
  const stored = await storedLayout<{
    root: { children: { type: string; children?: { props: Record<string, unknown> }[] }[] };
  }>(request, id);
  expect(stored.root.children[1]?.type).toBe("price-list");
  expect(stored.root.children[1]?.children?.map((c) => c.props["title"])).toEqual([
    "Espresso",
    "Cappuccino",
    "Croissant",
    "Mocha",
  ]);

  await publishPage(request, id);
  await page.goto(`/${slug}`);
  const list = page.getByRole("list", { name: "Coffee" });
  await expect(list.getByRole("listitem")).toHaveCount(4);
  // Title, leader and price share one line; the leader fills the gap between them.
  const line = await page
    .locator(".emvb-price-list-head")
    .first()
    .evaluate((head) => {
      const [title, leader, price] = [...head.children].map((el) => el.getBoundingClientRect());
      return {
        sameLine: Math.abs((title?.bottom ?? 0) - (price?.bottom ?? 99)) < 4,
        fills:
          (leader?.width ?? 0) > 20 && Math.abs((leader?.right ?? 0) - (price?.left ?? 0)) < 12,
      };
    });
  expect(line).toEqual({ sameLine: true, fills: true });
  expect(await page.locator("script[src*='emvb'], script[data-emvb]").count()).toBe(0);
});

test("a Call to action gets a ribbon and publishes with its title as the one link; clicking anywhere in the box follows it (W-1044)", async ({
  page,
  request,
}) => {
  const { id, slug } = await addTab(page, request, "Calls");
  await overlay(page).locator('[data-emvb-add-tile="cta"]').click();
  await expect(overlay(page).locator("h2.emvb-panel-title")).toHaveText("Call to action");
  await setField(page, "Ribbon text", "New");
  await setField(page, "Link", "/");
  await expect(canvas(page).locator(".emvb-cta-ribbon")).toHaveText("New");

  await saveDraft(page);
  const stored = await storedLayout<Stored>(request, id);
  expect(stored.root.children[1]).toMatchObject({
    type: "cta",
    props: { title: "Ready to start?", ribbon: "New", href: "/" },
  });

  await publishPage(request, id);
  await page.goto(`/${slug}`);
  const box = page.locator(".emvb-cta");
  await expect(box.getByRole("link")).toHaveCount(1);
  await expect(box.getByRole("link", { name: "Ready to start?" })).toHaveAttribute("href", "/");
  // The text and the button aren't links themselves, but a click on them still opens the link.
  const text = await page.locator(".emvb-cta-button").boundingBox();
  await page.mouse.click((text?.x ?? 0) + 5, (text?.y ?? 0) + 5);
  await expect(page).toHaveURL(/\/$/);
});

test("a Flip box turns up; on the page the tick box and keyboard focus on its link turn it over (W-1045)", async ({
  page,
  request,
}) => {
  const { id, slug } = await addTab(page, request, "Flips");
  await overlay(page).locator('[data-emvb-add-tile="flip-box"]').click();
  await expect(overlay(page).locator("h2.emvb-panel-title")).toHaveText("Flip box");
  await overlay(page).getByLabel("Turns").click();
  await page.getByRole("option", { name: "Up", exact: true }).click();
  await expect(canvas(page).locator(".emvb-flip-box")).toHaveClass(/emvb-flip-up/);

  await saveDraft(page);
  const stored = await storedLayout<Stored>(request, id);
  expect(stored.root.children[1]).toMatchObject({ type: "flip-box", props: { direction: "up" } });

  await publishPage(request, id);
  await page.goto(`/${slug}`);
  const inner = page.locator(".emvb-flip-inner");
  const turned = () => inner.evaluate((el) => getComputedStyle(el).transform !== "none");
  // Move the pointer away so hover doesn't turn it.
  await page.mouse.move(0, 0);
  await expect.poll(turned).toBe(false);
  // Both faces are there for screen readers.
  await expect(page.getByRole("heading", { name: "Here is the detail" })).toBeAttached();
  const toggle = page.getByRole("checkbox", { name: "Turn over" });
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toBeChecked();
  await expect.poll(turned).toBe(true);
  await page.keyboard.press("Space");
  await expect(toggle).not.toBeChecked();
  await expect.poll(turned).toBe(false);
  // Keyboard focus moving onto the back's link turns the card to show it.
  await page.getByRole("link", { name: "Read more" }).focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Read more" })).toBeFocused();
  await expect.poll(turned).toBe(true);
  expect(await page.locator("script[src*='emvb'], script[data-emvb]").count()).toBe(0);
});

test("an Animated headline is circled and rotates on the page until Pause, but not under reduced motion (W-1046)", async ({
  page,
  request,
  browser,
}) => {
  const { id, slug } = await addTab(page, request, "Headlines");
  await overlay(page).locator('[data-emvb-add-tile="headline"]').click();
  await expect(overlay(page).locator("h2.emvb-panel-title")).toHaveText("Animated headline");
  await overlay(page).getByLabel("Mark", { exact: true }).click();
  await page.getByRole("option", { name: "Circle" }).click();
  await expect(canvas(page).locator(".emvb-headline-shape")).toHaveCount(1);
  await overlay(page).getByRole("switch", { name: "Rotate the words" }).click();
  await setField(page, "Seconds per word", "1.5");

  await saveDraft(page);
  const stored = await storedLayout<Stored>(request, id);
  expect(stored.root.children[1]).toMatchObject({
    type: "headline",
    props: { mark: "circle", rotating: true, interval: 1.5 },
  });

  await publishPage(request, id);
  await page.goto(`/${slug}`);
  const heading = page.getByRole("heading", { name: "We build fast websites", level: 2 });
  await expect(heading).toBeVisible();
  const mark = page.locator(".emvb-headline-mark");
  await expect(mark).toContainText("accessible", { timeout: 5000 });
  // While it rotates, screen readers still hear the sentence with the first word.
  await expect(heading).toHaveAccessibleName("We build fast websites");
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(mark).toHaveText("fast");
  await expect(page.getByRole("button", { name: "Pause" })).toHaveCount(0);

  const reduced = await browser.newContext({ reducedMotion: "reduce" });
  try {
    const still = await reduced.newPage();
    await still.goto(new URL(`/${slug}`, page.url()).toString());
    await still.waitForLoadState("load");
    await still.waitForTimeout(2000);
    await expect(still.locator(".emvb-headline-mark")).toHaveText("fast");
    await expect(still.getByRole("button", { name: "Pause" })).toHaveCount(0);
  } finally {
    await reduced.close();
  }
});
