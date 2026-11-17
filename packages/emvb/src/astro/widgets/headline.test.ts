import { afterEach, describe, expect, test } from "bun:test";
import { initHeadlines } from "./headline.ts";

const realMatchMedia = globalThis.matchMedia;
const realSet = globalThis.setInterval;
const realClear = globalThis.clearInterval;
let live = new Map<number, () => void>();

function setup(reduced = false) {
  live = new Map();
  let next = 0;
  globalThis.matchMedia = ((query: string) => ({
    matches: reduced && query.includes("reduce"),
  })) as typeof globalThis.matchMedia;
  globalThis.setInterval = ((fn: () => void) => {
    live.set(++next, fn);
    return next;
  }) as unknown as typeof setInterval;
  globalThis.clearInterval = ((id: number) => {
    live.delete(id);
  }) as unknown as typeof clearInterval;
  document.body.innerHTML = `<h2 class="emvb-headline">We build <span class="emvb-headline-mark" data-emvb-rotate='["fast","accessible","beautiful"]' data-interval="2" data-turns="1">fast</span> sites</h2><a href="#next" id="next">Next</a>`;
  return document.querySelector<HTMLElement>(".emvb-headline-mark") as HTMLElement;
}
const tick = () => {
  for (const fn of live.values()) fn();
};

afterEach(() => {
  globalThis.matchMedia = realMatchMedia;
  globalThis.setInterval = realSet;
  globalThis.clearInterval = realClear;
  document.body.innerHTML = "";
});

describe("headline runtime (W-1046)", () => {
  test("rotates the words for its rounds and stops on the first; screen readers keep the sentence", () => {
    const mark = setup();
    initHeadlines(document);
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector(".emvb-headline-sr")?.textContent).toBe("fast");
    tick();
    expect(mark.textContent).toBe("accessible");
    tick();
    expect(mark.textContent).toBe("beautiful");
    tick();
    expect(mark.textContent).toBe("fast");
    expect(live.size).toBe(0);
    expect(mark.hasAttribute("aria-hidden")).toBe(false);
    expect(document.querySelectorAll(".emvb-headline-sr, .emvb-headline-pause").length).toBe(0);
  });

  test("Pause after the heading stops it on the first word and keeps focus on the page", () => {
    const mark = setup();
    initHeadlines(document);
    tick();
    const pause = document.querySelector<HTMLButtonElement>(".emvb-headline-pause");
    expect(pause?.previousElementSibling?.tagName).toBe("H2");
    pause?.focus();
    pause?.click();
    expect(mark.textContent).toBe("fast");
    expect(live.size).toBe(0);
    expect(document.activeElement?.id).toBe("next");
  });

  test("under reduced motion nothing rotates and no button is added", () => {
    const mark = setup(true);
    initHeadlines(document);
    expect(live.size).toBe(0);
    expect(mark.hasAttribute("aria-hidden")).toBe(false);
    expect(document.querySelectorAll(".emvb-headline-pause").length).toBe(0);
  });

  test("when the rotation ends with Pause focused, focus moves on instead of to the page (W-1059)", () => {
    setup();
    initHeadlines(document);
    document.querySelector<HTMLButtonElement>(".emvb-headline-pause")?.focus();
    tick();
    tick();
    tick();
    expect(document.querySelectorAll(".emvb-headline-pause").length).toBe(0);
    expect(document.activeElement?.id).toBe("next");
  });

  test("when the rotation ends with focus elsewhere, focus stays there (W-1059)", () => {
    setup();
    document.body.insertAdjacentHTML(
      "beforeend",
      '<button type="button" id="other">Other</button>',
    );
    initHeadlines(document);
    document.querySelector<HTMLButtonElement>("#other")?.focus();
    tick();
    tick();
    tick();
    expect(document.activeElement?.id).toBe("other");
  });
});
