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

function header(style = "") {
  document.body.innerHTML = `<div data-emvb-sticky-hide style="${style}"><a href="/">Home</a></div><main>Text</main>`;
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
    const animate = spyOn(el, "animate");
    scrollTo(300);
    expect(el.style.translate).toBe("0 -100%");
    expect(animate).not.toHaveBeenCalled();
  });

  test("it slides with an animation of its own and leaves the element's transitions alone", () => {
    const el = header("transition: opacity 0.5s");
    const animate = spyOn(el, "animate");
    scrollTo(200);
    expect(animate).toHaveBeenCalledWith([{ translate: "0 0" }, { translate: "0 -100%" }], {
      duration: 250,
      easing: "ease",
    });
    expect(el.style.transition).toBe("opacity 0.5s");
    scrollTo(100);
    expect(animate).toHaveBeenLastCalledWith([{ translate: "0 -100%" }, { translate: "0 0" }], {
      duration: 250,
      easing: "ease",
    });
    expect(el.style.transition).toBe("opacity 0.5s");
  });

  test("a bar held at the bottom of the screen slides down, not up", () => {
    const el = header("position: fixed; bottom: 0");
    // In the lower half of a 768 px window, as a real browser lays it out.
    spyOn(el, "getBoundingClientRect").mockReturnValue({ top: 708, height: 60 } as DOMRect);
    scrollTo(200);
    expect(el.style.translate).toBe("0 100%");
    scrollTo(100);
    expect(el.style.translate).toBe("");
  });

  test("a device whose CSS turns hiding off keeps it in place, and brings it back", () => {
    const el = header("--emvb-sticky-hide: 0");
    scrollTo(200);
    expect(el.style.translate).toBe("");
    el.style.setProperty("--emvb-sticky-hide", "1");
    scrollTo(400);
    expect(el.style.translate).toBe("0 -100%");
    // The window narrows to a device where hiding is off: it comes back without a scroll up.
    el.style.setProperty("--emvb-sticky-hide", "0");
    scrollTo(600);
    expect(el.style.translate).toBe("");
    expect(el.dataset["emvbAway"]).toBeUndefined();
  });

  test("a sticky header part's wrapper hides for the box inside it (W-1097)", () => {
    document.body.innerHTML =
      '<header data-emvb-sticky-hide><div class="emvb-root"><div data-emvb-sticky-hide><a href="/">Home</a></div></div></header>';
    const [wrapper, box] = [...document.querySelectorAll<HTMLElement>("[data-emvb-sticky-hide]")];
    for (const el of [wrapper, box])
      Object.defineProperty(el, "offsetHeight", { configurable: true, value: 60 });
    initSticky(document);
    scrollTo(200);
    expect(wrapper?.style.translate).toBe("0 -100%");
    // Only the wrapper moves: the box inside it moving too would slide twice as far.
    expect(box?.style.translate).toBe("");
    expect(box?.dataset["emvbReady"]).toBeUndefined();
    scrollTo(100);
    expect(wrapper?.style.translate).toBe("");
  });
});
