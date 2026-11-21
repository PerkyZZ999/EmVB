/**
 * W-1070: the opt-in sticky script. An element marked `data-emvb-sticky-hide` (its style's "Hide
 * while scrolling down") slides out of view once the page scrolls down past it, and back as soon
 * as the visitor scrolls up. Its CSS custom property `--emvb-sticky-hide` says whether that is on
 * at the current width (`0` turns it off on a device). A bar held at the top slides up; one held
 * at the bottom slides down. It never hides while focus is inside it (WCAG 2.4.11), and it moves
 * without animation for visitors who prefer reduced motion. The slide is a Web Animation, so the
 * element's own CSS transitions stay as they are.
 */

/** Scrolls smaller than this (px) don't change direction: trackpads jitter. */
const SLACK = 4;

/**
 * Moves `el` to `to` (`""` is its place), sliding from where it was unless motion is reduced. A
 * slide started before is left to finish: the newer one sits above it and wins.
 */
function move(el: HTMLElement, to: string, reduced: boolean): void {
  const from = el.style.translate;
  if (from === to) return;
  el.style.translate = to;
  if (reduced || typeof el.animate !== "function") return;
  el.animate([{ translate: from || "0 0" }, { translate: to || "0 0" }], {
    duration: 250,
    easing: "ease",
  });
}

function show(el: HTMLElement, reduced: boolean): void {
  delete el.dataset["emvbAway"];
  move(el, "", reduced);
}

/** Whether hiding is on at this width; an older page without the property always hides. */
function hidesHere(style: CSSStyleDeclaration): boolean {
  return style.getPropertyValue("--emvb-sticky-hide").trim() !== "0";
}

/**
 * Held in the lower half of the screen (a bar fixed or stuck to the bottom): it leaves downwards.
 * Read from where it sits, as the computed `top` of a placed element is a length, never `auto`.
 */
function heldAtBottom(el: HTMLElement): boolean {
  const { top, height } = el.getBoundingClientRect();
  return top + height / 2 > globalThis.innerHeight / 2;
}

export function initSticky(root: ParentNode = document): void {
  // W-1097: a sticky header or footer part's wrapper hides for its box; the box stays in it.
  const all = [...root.querySelectorAll<HTMLElement>("[data-emvb-sticky-hide]")].filter(
    (el) =>
      el.dataset["emvbReady"] === undefined &&
      !el.parentElement?.closest("[data-emvb-sticky-hide]"),
  );
  if (all.length === 0) return;
  const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  for (const el of all) {
    el.dataset["emvbReady"] = "";
    // Focus moving in (a Tab from the address bar, a skip link) brings it back at once.
    el.addEventListener("focusin", () => show(el, reduced));
  }
  let last = globalThis.scrollY;
  let frame = 0;
  const update = () => {
    const y = globalThis.scrollY;
    if (Math.abs(y - last) < SLACK) return;
    const down = y > last;
    last = y;
    for (const el of all) {
      const style = getComputedStyle(el);
      if (!hidesHere(style)) {
        if (el.dataset["emvbAway"] !== undefined) show(el, reduced);
      } else if (down && y > el.offsetHeight && !el.contains(document.activeElement)) {
        if (el.dataset["emvbAway"] !== undefined) continue;
        el.dataset["emvbAway"] = "";
        move(el, heldAtBottom(el) ? "0 100%" : "0 -100%", reduced);
      } else if (!down) {
        show(el, reduced);
      }
    }
  };
  globalThis.addEventListener(
    "scroll",
    () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    },
    { passive: true },
  );
}
