/**
 * W-1018: the opt-in Carousel controls. A carousel works without this script (a snapping track
 * you swipe, scroll or move with the arrow keys); this adds what it asked for:
 *   - Previous and Next buttons (`data-emvb-arrows`), disabled at the ends unless it loops;
 *   - one button per slide (`data-emvb-dots`), the current one marked aria-current;
 *   - autoplay (`data-emvb-autoplay="<seconds>"`) with a visible Pause/Play button placed before
 *     the slides, paused while the carousel is hovered or holds focus, and starting paused when
 *     the visitor prefers reduced motion (WCAG 2.2.2).
 */

type Carousel = {
  root: HTMLElement;
  track: HTMLElement;
  slides: HTMLElement[];
  loop: boolean;
  index: number;
  prev?: HTMLButtonElement;
  next?: HTMLButtonElement;
  dots: HTMLButtonElement[];
  timer?: ReturnType<typeof setInterval>;
  /** The visitor pressed Pause (or reduced motion started it paused). */
  stopped: boolean;
  /** Hovered or focused: paused for now. */
  held: boolean;
};

function button(label: string, text: string, className = ""): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", label);
  el.textContent = text;
  if (className) el.className = className;
  return el;
}

/** How many slides show at once, from the layout (1 when it can't be measured). */
function perView(c: Carousel): number {
  const first = c.slides[0];
  if (!first || first.offsetWidth === 0) return 1;
  return Math.max(1, Math.round(c.track.clientWidth / first.offsetWidth));
}

/** The last slide a view can start at. */
const lastStart = (c: Carousel) => Math.max(0, c.slides.length - perView(c));

function update(c: Carousel): void {
  const last = lastStart(c);
  if (c.prev) c.prev.disabled = !c.loop && c.index <= 0;
  if (c.next) c.next.disabled = !c.loop && c.index >= last;
  c.dots.forEach((dot, i) => {
    if (i === c.index) dot.setAttribute("aria-current", "true");
    else dot.removeAttribute("aria-current");
  });
}

/** Shows slide `index` (wrapped when looping or playing, else kept in range). */
function go(c: Carousel, index: number, wrap = c.loop): void {
  const last = lastStart(c);
  c.index = wrap
    ? index > last
      ? 0
      : index < 0
        ? last
        : index
    : Math.min(Math.max(index, 0), last);
  const target = c.slides[c.index];
  const origin = c.slides[0];
  if (target && origin) c.track.scrollTo({ left: target.offsetLeft - origin.offsetLeft });
  update(c);
}

const present = (els: (HTMLElement | undefined)[]): HTMLElement[] =>
  els.filter((el): el is HTMLElement => el !== undefined);

function setup(root: HTMLElement): void {
  const track = root.querySelector<HTMLElement>(":scope > .emvb-carousel-track");
  if (!track) return;
  const c: Carousel = {
    root,
    track,
    slides: [...track.children].filter((el): el is HTMLElement => el instanceof HTMLElement),
    loop: root.hasAttribute("data-emvb-loop"),
    index: 0,
    dots: [],
    stopped: false,
    held: false,
  };
  if (c.slides.length < 2) return;
  const controls = document.createElement("div");
  controls.className = "emvb-carousel-controls";
  if (root.hasAttribute("data-emvb-arrows")) {
    c.prev = button("Previous slide", "‹");
    c.next = button("Next slide", "›");
    c.prev.addEventListener("click", () => go(c, c.index - 1));
    c.next.addEventListener("click", () => go(c, c.index + 1));
  }
  if (root.hasAttribute("data-emvb-dots")) {
    const dots = document.createElement("div");
    dots.className = "emvb-carousel-dots";
    for (let i = 0; i <= lastStart(c); i++) {
      const dot = button(`Go to slide ${i + 1}`, "");
      dot.addEventListener("click", () => go(c, i, false));
      c.dots.push(dot);
      dots.append(dot);
    }
    controls.append(...present([c.prev, dots, c.next]));
  } else {
    controls.append(...present([c.prev, c.next]));
  }
  if (controls.childElementCount > 0) track.after(controls);
  const seconds = Number(root.dataset["emvbAutoplay"]);
  if (Number.isFinite(seconds) && seconds > 0) autoplay(c, seconds);
  // Swipes and scrolls move the current slide too.
  let frame = 0;
  track.addEventListener("scroll", () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const first = c.slides[0];
      const step = first?.offsetWidth ?? 0;
      if (step <= 0) return;
      c.index = Math.min(Math.round(track.scrollLeft / step), lastStart(c));
      update(c);
    });
  });
  update(c);
}

function autoplay(c: Carousel, seconds: number): void {
  const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  c.stopped = reduced;
  const toggle = button("", "", "emvb-carousel-play");
  const label = () => {
    toggle.textContent = c.stopped ? "Play" : "Pause";
    toggle.setAttribute("aria-label", c.stopped ? "Play slides" : "Pause slides");
  };
  const tick = () => {
    if (!c.stopped && !c.held) go(c, c.index + 1, true);
  };
  toggle.addEventListener("click", () => {
    c.stopped = !c.stopped;
    label();
  });
  label();
  // The rotation control comes before the slides, so keyboard users reach it first.
  const bar = document.createElement("div");
  bar.className = "emvb-carousel-controls emvb-carousel-autoplay";
  bar.append(toggle);
  c.track.before(bar);
  const hold = (held: boolean) => () => {
    c.held = held;
  };
  c.root.addEventListener("pointerenter", hold(true));
  c.root.addEventListener("pointerleave", hold(false));
  c.root.addEventListener("focusin", hold(true));
  c.root.addEventListener("focusout", (event) => {
    if (!c.root.contains(event.relatedTarget as Node | null)) c.held = false;
  });
  c.timer = setInterval(tick, seconds * 1000);
}

export function initCarousels(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>("section.emvb-carousel")) {
    if (el.dataset["emvbCarouselReady"] !== undefined) continue;
    el.dataset["emvbCarouselReady"] = "";
    setup(el);
  }
}
