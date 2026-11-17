/**
 * W-1070: the opt-in sticky script. An element marked `data-emvb-sticky-hide` (its style's "Hide
 * while scrolling down") slides up out of view once the page scrolls down past it, and back as
 * soon as the visitor scrolls up. It never hides while focus is inside it (WCAG 2.4.11), and it
 * moves without a transition for visitors who prefer reduced motion.
 */

/** Scrolls smaller than this (px) don't change direction: trackpads jitter. */
const SLACK = 4;

function show(el: HTMLElement): void {
  delete el.dataset["emvbAway"];
  el.style.translate = "";
}

export function initSticky(root: ParentNode = document): void {
  const all = [...root.querySelectorAll<HTMLElement>("[data-emvb-sticky-hide]")].filter(
    (el) => el.dataset["emvbReady"] === undefined,
  );
  if (all.length === 0) return;
  const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  for (const el of all) {
    el.dataset["emvbReady"] = "";
    if (!reduced) el.style.transition = "translate 0.25s ease";
    // Focus moving in (a Tab from the address bar, a skip link) brings it back at once.
    el.addEventListener("focusin", () => show(el));
  }
  let last = globalThis.scrollY;
  let frame = 0;
  const update = () => {
    const y = globalThis.scrollY;
    if (Math.abs(y - last) < SLACK) return;
    const down = y > last;
    last = y;
    for (const el of all) {
      if (down && y > el.offsetHeight && !el.contains(document.activeElement)) {
        el.dataset["emvbAway"] = "";
        el.style.translate = "0 -100%";
      } else if (!down) {
        show(el);
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
