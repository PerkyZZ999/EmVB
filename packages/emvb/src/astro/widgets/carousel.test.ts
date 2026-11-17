import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { initCarousels } from "./carousel.ts";

// happy-dom has no layout: every slide is 0 px wide, so one slide shows at a time.
type Tick = () => void;
let ticks: Tick[] = [];
let intervals: number[] = [];
const realMatch = globalThis.matchMedia;

beforeEach(() => {
  ticks = [];
  intervals = [];
  spyOn(globalThis, "setInterval").mockImplementation(((fn: Tick, ms: number) => {
    ticks.push(fn);
    intervals.push(ms);
    return 1;
  }) as never);
  HTMLElement.prototype.scrollTo = () => undefined;
});
afterEach(() => {
  globalThis.matchMedia = realMatch;
  mock.restore();
});

function fixture(options: string) {
  document.body.innerHTML = `
    <section class="emvb-carousel" aria-roledescription="carousel" aria-label="Stories" ${options}>
      <div class="emvb-carousel-track" tabindex="0">
        <div role="group" aria-label="1 of 3">A</div>
        <div role="group" aria-label="2 of 3">B</div>
        <div role="group" aria-label="3 of 3">C</div>
      </div>
    </section>`;
  initCarousels(document);
  return document.querySelector<HTMLElement>("section") as HTMLElement;
}
const named = (name: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
const current = () =>
  [...document.querySelectorAll(".emvb-carousel-dots button")].findIndex((b) =>
    b.hasAttribute("aria-current"),
  );

describe("carousel runtime (W-1018)", () => {
  test("without options it adds nothing", () => {
    const root = fixture("");
    expect(root.querySelectorAll("button")).toHaveLength(0);
    expect(ticks).toHaveLength(0);
  });

  test("arrows and dots: named buttons after the slides; ends disable without loop", () => {
    const root = fixture("data-emvb-arrows data-emvb-dots");
    const controls = root.querySelector(".emvb-carousel-track + .emvb-carousel-controls");
    expect(
      [...(controls?.querySelectorAll("button") ?? [])].map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Previous slide", "Go to slide 1", "Go to slide 2", "Go to slide 3", "Next slide"]);
    expect(named("Previous slide")?.disabled).toBe(true);
    expect(current()).toBe(0);
    named("Next slide")?.click();
    named("Next slide")?.click();
    expect(current()).toBe(2);
    expect(named("Next slide")?.disabled).toBe(true);
    named("Go to slide 2")?.click();
    expect(current()).toBe(1);
  });

  test("with loop, Next on the last slide goes back to the first", () => {
    fixture("data-emvb-arrows data-emvb-dots data-emvb-loop");
    named("Previous slide")?.click();
    expect(current()).toBe(2);
    expect(named("Next slide")?.disabled).toBe(false);
    named("Next slide")?.click();
    expect(current()).toBe(0);
  });

  test("autoplay: a Pause button comes before the slides and every few seconds it moves on", () => {
    const root = fixture('data-emvb-autoplay="8" data-emvb-dots');
    const pause = named("Pause slides");
    expect(pause?.textContent).toBe("Pause");
    expect(root.firstElementChild?.contains(pause ?? null)).toBe(true);
    expect(intervals).toEqual([8000]);
    ticks[0]?.();
    expect(current()).toBe(1);
    pause?.click();
    expect(named("Play slides")?.textContent).toBe("Play");
    ticks[0]?.();
    expect(current()).toBe(1);
  });

  test("autoplay waits while the carousel is hovered or focused, and goes round at the end", () => {
    const root = fixture('data-emvb-autoplay="5" data-emvb-dots');
    root.dispatchEvent(new Event("pointerenter"));
    ticks[0]?.();
    expect(current()).toBe(0);
    root.dispatchEvent(new Event("pointerleave"));
    ticks[0]?.();
    ticks[0]?.();
    ticks[0]?.();
    expect(current()).toBe(0);
  });

  test("under reduced motion autoplay starts paused", () => {
    globalThis.matchMedia = ((query: string) => ({
      matches: query.includes("reduce"),
    })) as never;
    fixture('data-emvb-autoplay="5" data-emvb-dots');
    expect(named("Play slides")).not.toBeNull();
    ticks[0]?.();
    expect(current()).toBe(0);
  });

  test("pointer and focus hold autoplay separately: releasing one keeps it held (W-1058)", () => {
    const root = fixture('data-emvb-autoplay="3" data-emvb-dots');
    const track = root.querySelector<HTMLElement>(".emvb-carousel-track");
    root.dispatchEvent(new Event("pointerenter"));
    track?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    root.dispatchEvent(new Event("pointerleave"));
    ticks[0]?.();
    expect(current()).toBe(0);
    root.dispatchEvent(new Event("pointerenter"));
    track?.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
    ticks[0]?.();
    expect(current()).toBe(0);
    root.dispatchEvent(new Event("pointerleave"));
    ticks[0]?.();
    expect(current()).toBe(1);
  });
});

// A fake layout: `width` px track, slides `slide` px wide with `gap` px between, RTL negative.
function measured(count: number, options: { width: number; slide: number; gap: number }) {
  const slides = Array.from(
    { length: count },
    (_, i) => `<div role="group" aria-label="${i + 1} of ${count}">${i}</div>`,
  ).join("");
  document.body.innerHTML = `
    <section class="emvb-carousel" aria-label="Stories" data-emvb-dots data-emvb-arrows>
      <div class="emvb-carousel-track" tabindex="0">${slides}</div>
    </section>`;
  const root = document.querySelector<HTMLElement>("section") as HTMLElement;
  const track = root.querySelector<HTMLElement>(".emvb-carousel-track") as HTMLElement;
  const layout = { ...options, rtl: false, scroll: 0 };
  Object.defineProperty(track, "clientWidth", { get: () => layout.width });
  Object.defineProperty(track, "scrollLeft", { get: () => layout.scroll });
  [...track.children].forEach((el, i) => {
    Object.defineProperty(el, "offsetWidth", { get: () => layout.slide });
    Object.defineProperty(el, "offsetLeft", {
      get: () => (layout.rtl ? -1 : 1) * i * (layout.slide + layout.gap),
    });
  });
  return { root, track, layout };
}

describe("carousel runtime follows the real layout", () => {
  let resized: (() => void)[] = [];
  const realObserver = globalThis.ResizeObserver;
  beforeEach(() => {
    resized = [];
    globalThis.ResizeObserver = class {
      constructor(callback: () => void) {
        resized.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as never;
    spyOn(globalThis, "requestAnimationFrame").mockImplementation(((fn: () => void) => {
      fn();
      return 1;
    }) as never);
  });
  afterEach(() => {
    globalThis.ResizeObserver = realObserver;
  });
  const dots = () => document.querySelectorAll(".emvb-carousel-dots button").length;

  test("a resize rebuilds the dots for the start positions the new width can reach (W-1055)", () => {
    const { track, layout } = measured(5, { width: 1384, slide: 450, gap: 16 });
    initCarousels(document);
    expect(dots()).toBe(3);
    named("Next slide")?.click();
    Object.assign(layout, { width: 884, slide: 434, scroll: 450 });
    resized.forEach((fn) => fn());
    expect(dots()).toBe(4);
    expect(current()).toBe(1);
    expect(named("Next slide")?.disabled).toBe(false);
    expect(track.isConnected).toBe(true);
  });

  test("a carousel set up hidden gets its dots once it can be measured (W-1055)", () => {
    const { layout } = measured(5, { width: 0, slide: 0, gap: 16 });
    initCarousels(document);
    expect(dots()).toBe(5);
    Object.assign(layout, { width: 1384, slide: 450 });
    resized.forEach((fn) => fn());
    expect(dots()).toBe(3);
    named("Go to slide 3")?.click();
    expect(named("Next slide")?.disabled).toBe(true);
  });

  test("in RTL the dot follows the negative scroll position (W-1057)", () => {
    const { track, layout } = measured(5, { width: 1385, slide: 1385, gap: 16 });
    layout.rtl = true;
    initCarousels(document);
    layout.scroll = -1401;
    track.dispatchEvent(new Event("scroll"));
    expect(current()).toBe(1);
    expect(named("Previous slide")?.disabled).toBe(false);
  });

  test("gaps add up: slide 12 of 14 marks dot 12, not 13 (W-1057)", () => {
    const { track, layout } = measured(14, { width: 300, slide: 300, gap: 16 });
    initCarousels(document);
    layout.scroll = 11 * 316;
    track.dispatchEvent(new Event("scroll"));
    expect(current()).toBe(11);
  });
});
