import { afterEach, describe, expect, test } from "bun:test";
import { initCounters } from "./counter.ts";

type Observer = { callback: IntersectionObserverCallback; targets: Element[] };
let observers: Observer[] = [];
let frames: FrameRequestCallback[] = [];
const realMatchMedia = globalThis.matchMedia;
const realObserver = globalThis.IntersectionObserver;
const realFrame = globalThis.requestAnimationFrame;

function setup(reduced: boolean) {
  observers = [];
  frames = [];
  globalThis.matchMedia = ((query: string) => ({
    matches: reduced && query.includes("reduce"),
  })) as typeof globalThis.matchMedia;
  globalThis.IntersectionObserver = class {
    entry: Observer;
    constructor(callback: IntersectionObserverCallback) {
      this.entry = { callback, targets: [] };
      observers.push(this.entry);
    }
    observe(el: Element) {
      this.entry.targets.push(el);
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  };
  document.body.innerHTML = `<p class="emvb-counter-number"><span class="emvb-counter-value" data-emvb-counter data-from="0" data-to="1200" data-separator="," data-duration="1000">1,200</span>+</p>`;
  return document.querySelector<HTMLElement>("[data-emvb-counter]") as HTMLElement;
}

function scrollIntoView() {
  for (const o of observers)
    o.callback(
      o.targets.map((target) => ({ target, isIntersecting: true })) as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    );
}

function frame(at: number) {
  const pending = frames;
  frames = [];
  for (const cb of pending) cb(at);
}

afterEach(() => {
  globalThis.matchMedia = realMatchMedia;
  globalThis.IntersectionObserver = realObserver;
  globalThis.requestAnimationFrame = realFrame;
  document.body.innerHTML = "";
});

describe("counter runtime (W-1038)", () => {
  test("shows the start, counts up in view and ends on the rendered number", () => {
    const el = setup(false);
    const now = performance.now();
    initCounters(document);
    expect(el.textContent).toBe("0");
    expect(el.getAttribute("aria-hidden")).toBe("true");
    // Screen readers keep the final number while it counts.
    expect(document.querySelector(".emvb-counter-sr")?.textContent).toBe("1,200");
    scrollIntoView();
    frame(now + 500);
    const midway = Number((el.textContent ?? "").replaceAll(",", ""));
    expect(midway > 0 && midway < 1200).toBe(true);
    frame(now + 2000);
    expect(el.textContent).toBe("1,200");
    expect(el.hasAttribute("aria-hidden")).toBe(false);
    expect(document.querySelector(".emvb-counter-sr")?.outerHTML ?? null).toBeNull();
  });

  test("under reduced motion the final number stays and nothing is watched", () => {
    const el = setup(true);
    initCounters(document);
    expect(el.textContent).toBe("1,200");
    expect(observers.length).toBe(0);
    expect(el.hasAttribute("aria-hidden")).toBe(false);
  });

  test("running twice prepares each counter once", () => {
    setup(false);
    initCounters(document);
    initCounters(document);
    expect(document.querySelectorAll(".emvb-counter-sr").length).toBe(1);
  });
});
