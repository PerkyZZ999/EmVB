import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { initSticky } from "./sticky.ts";

const realMatch = globalThis.matchMedia;
// The window's own scrollY, put back after each test so later files see a normal window.
const realScrollY = Object.getOwnPropertyDescriptor(globalThis, "scrollY");
let y = 0;
beforeEach(() => {
  y = 0;
  Object.defineProperty(globalThis, "scrollY", { configurable: true, get: () => y });
  spyOn(globalThis, "requestAnimationFrame").mockImplementation(((fn: () => void) => {
    fn();
    return 1;
  }) as never);
});
afterEach(() => {
  globalThis.matchMedia = realMatch;
  mock.restore();
  if (realScrollY) Object.defineProperty(globalThis, "scrollY", realScrollY);
  else Reflect.deleteProperty(globalThis, "scrollY");
  document.body.innerHTML = "";
});

function header() {
  document.body.innerHTML = `<div data-emvb-sticky-hide><a href="/">Home</a></div><main>Text</main>`;
  const el = document.querySelector<HTMLElement>("[data-emvb-sticky-hide]") as HTMLElement;
  Object.defineProperty(el, "offsetHeight", { configurable: true, value: 60 });
  initSticky(document);
  return el;
}
const scrollTo = (next: number) => {
  y = next;
  globalThis.dispatchEvent(new Event("scroll"));
};

describe("sticky script (W-1070)", () => {
  test("scrolling down past it slides it away; scrolling up brings it back", () => {
    const el = header();
    expect(el.style.transition).toBe("translate 0.25s ease");
    scrollTo(30);
    expect(el.style.translate).toBe("");
    scrollTo(200);
    expect(el.style.translate).toBe("0 -100%");
    scrollTo(150);
    expect(el.style.translate).toBe("");
  });

  test("it stays while focus is inside, and focus coming in brings it back", () => {
    const el = header();
    scrollTo(200);
    expect(el.style.translate).toBe("0 -100%");
    el.querySelector("a")?.focus();
    expect(el.style.translate).toBe("");
    scrollTo(400);
    expect(el.style.translate).toBe("");
  });

  test("under reduced motion it moves without a transition", () => {
    globalThis.matchMedia = ((query: string) => ({ matches: query.includes("reduce") })) as never;
    const el = header();
    expect(el.style.transition).toBe("");
    scrollTo(300);
    expect(el.style.translate).toBe("0 -100%");
  });
});
