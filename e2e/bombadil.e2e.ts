import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce } from "./support/api.ts";
import { unique } from "./support/helpers.ts";

// W-1054–W-1060: the public widget defects the Bombadil runs found (2026-11-16), each checked on
// a published page in a real browser: layout, scrolling, focus and timers that happy-dom fakes.

setUpEmvbOnce();

type Node = { id: string; type: string; props: Record<string, unknown>; children?: Node[] };

const text = (id: string, value: string): Node => ({ id, type: "text", props: { text: value } });
const slides = (count: number): Node[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `slid${String(i + 1).padStart(4, "0")}`,
    type: "carousel-slide",
    props: {},
    children: [text(`slte${String(i + 1).padStart(4, "0")}`, `Slide ${i + 1}`)],
  }));
const carousel = (props: Record<string, unknown>, count = 5): Node => ({
  id: "caro0001",
  type: "carousel",
  props: { label: "Stories", dots: true, arrows: true, ...props },
  children: slides(count),
});

async function publish(page: Page, request: APIRequestContext, children: Node[], dir?: "rtl") {
  const slug = `bombadil-${unique()}`;
  const layout = {
    schemaVersion: 18,
    root: { id: "root0001", type: "container", props: {}, ...(dir ? { dir } : {}), children },
  };
  const id = await createPage(request, "Bombadil", layout, slug);
  await publishPage(request, id);
  await page.goto(`/${slug}`);
}

const region = (page: Page) => page.getByRole("region", { name: "Stories" });
const dots = (page: Page) => region(page).locator(".emvb-carousel-dots button");
const currentDot = (page: Page) =>
  dots(page).evaluateAll((all) => all.findIndex((b) => b.getAttribute("aria-current") === "true"));
const perView = (page: Page) =>
  region(page)
    .locator(".emvb-carousel-track")
    .evaluate((track) => {
      const slide = track.firstElementChild as HTMLElement;
      return Math.round(track.clientWidth / slide.offsetWidth);
    });

test("a carousel's dots follow a resize, and phones show one slide for 3 per view (W-1055, W-1056)", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await publish(page, request, [carousel({ perView: 3 })]);
  await expect(dots(page)).toHaveCount(3);
  await region(page).getByRole("button", { name: "Next slide" }).click();
  await expect.poll(() => currentDot(page)).toBe(1);
  await page.setViewportSize({ width: 900, height: 900 });
  await expect(dots(page)).toHaveCount(4);
  expect(await perView(page)).toBe(2);
  await page.setViewportSize({ width: 480, height: 900 });
  await expect(dots(page)).toHaveCount(5);
  expect(await perView(page)).toBe(1);
});

test("a carousel in a hidden tab gets its dots when the tab opens (W-1055)", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await publish(page, request, [
    {
      id: "tabs0001",
      type: "tabs",
      props: {},
      children: [
        {
          id: "tabp0001",
          type: "tab-panel",
          props: { label: "First" },
          children: [text("tx01", "One")],
        },
        {
          id: "tabp0002",
          type: "tab-panel",
          props: { label: "Second" },
          children: [carousel({ perView: 3 })],
        },
      ],
    },
  ]);
  await page.getByRole("tab", { name: "Second" }).click();
  await expect(dots(page)).toHaveCount(3);
});

test("the current dot follows scrolling in RTL and on a long carousel with gaps (W-1057)", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await publish(page, request, [carousel({})], "rtl");
  const track = region(page).locator(".emvb-carousel-track");
  await track.evaluate((el) => {
    const second = el.children[1] as HTMLElement;
    el.scrollTo({
      left: second.offsetLeft - (el.children[0] as HTMLElement).offsetLeft,
      behavior: "instant",
    });
  });
  await expect.poll(() => currentDot(page)).toBe(1);

  await page.setViewportSize({ width: 340, height: 900 });
  await publish(page, request, [carousel({}, 14)]);
  await region(page)
    .locator(".emvb-carousel-track")
    .evaluate((el) => {
      const twelfth = el.children[11] as HTMLElement;
      el.scrollTo({
        left: twelfth.offsetLeft - (el.children[0] as HTMLElement).offsetLeft,
        behavior: "instant",
      });
    });
  await expect.poll(() => currentDot(page)).toBe(11);
});

test("autoplay stays paused while focus is inside, after the pointer leaves (W-1058)", async ({
  page,
  request,
}) => {
  await page.clock.install();
  await page.setViewportSize({ width: 1400, height: 900 });
  await publish(page, request, [carousel({ autoplay: true, interval: 3 })]);
  const track = region(page).locator(".emvb-carousel-track");
  await track.hover();
  await track.focus();
  await page.mouse.move(5, 5);
  await page.clock.runFor(7000);
  expect(await currentDot(page)).toBe(0);
  await track.blur();
  await page.clock.runFor(3100);
  expect(await currentDot(page)).toBe(1);
});

test("dismissing an Alert right before Tabs focuses the selected tab (W-1054)", async ({
  page,
  request,
}) => {
  await publish(page, request, [
    {
      id: "alrt0001",
      type: "alert",
      props: { variant: "info", text: "Heads up.", dismissible: true },
    },
    {
      id: "tabs0001",
      type: "tabs",
      props: {},
      children: [
        {
          id: "tabp0001",
          type: "tab-panel",
          props: { label: "First" },
          children: [text("tx01", "One")],
        },
        {
          id: "tabp0002",
          type: "tab-panel",
          props: { label: "Second" },
          children: [text("tx02", "Two")],
        },
      ],
    },
  ]);
  await page.getByRole("button", { name: "Dismiss" }).press("Enter");
  await expect(page.getByRole("tab", { name: "First" })).toBeFocused();
});

test("when a headline's rotation ends with Pause focused, focus doesn't fall to the page (W-1059)", async ({
  page,
  request,
}) => {
  await page.clock.install();
  await publish(page, request, [
    {
      id: "head0001",
      type: "headline",
      props: {
        level: 2,
        before: "We build",
        highlight: "fast",
        after: "websites",
        rotate: ["accessible"],
        rotating: true,
        interval: 1.5,
        turns: 1,
      },
    },
  ]);
  const pause = page.getByRole("button", { name: "Pause" });
  await pause.focus();
  await page.clock.runFor(4000);
  await expect(pause).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
});

test("a countdown shows its ended text at the target, not before (W-1060)", async ({
  page,
  request,
}) => {
  const soon = new Date(Date.now() + 3 * 3600 * 1000);
  soon.setUTCSeconds(0, 0);
  const target = soon.getTime();
  await page.clock.install({ time: target - 5000 });
  await publish(page, request, [
    {
      id: "cdwn0001",
      type: "countdown",
      props: { target: `${soon.toISOString().slice(0, 16)}Z`, ticking: true, expiredText: "Ended" },
    },
  ]);
  const ended = page.locator(".emvb-countdown-expired");
  await expect(page.locator(".emvb-countdown-clock")).toBeVisible();
  // Pausing restarts the timers from that moment: ticks then land 400 ms before each whole
  // second left, as they can on a real page, so one comes 400 ms before the target.
  await page.clock.pauseAt(target - 3400);
  await page.clock.runFor(3300);
  await expect(ended).not.toHaveAttribute("data-emvb-shown");
  await page.clock.runFor(200);
  await expect(ended).toHaveAttribute("data-emvb-shown", "");
});
