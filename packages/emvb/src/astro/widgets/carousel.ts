/**
 * W-1018: the opt-in Carousel controls. A carousel works without this script (a snapping track
 * you swipe, scroll or move with the arrow keys); this adds what it asked for:
 *   - Previous and Next buttons (`data-emvb-arrows`), disabled at the ends unless it loops;
 *   - one button per slide (`data-emvb-dots`), the current one marked aria-current;
 *   - autoplay (`data-emvb-autoplay="<seconds>"`) with a visible Pause/Play button placed before
 *     the slides, paused while the carousel is hovered or holds focus, and starting paused when
 *     the visitor prefers reduced motion (WCAG 2.2.2).
 * The dots follow the track's size (W-1055): a resize, or a carousel shown from a hidden tab,
 * rebuilds them for the start positions that view can reach.
 */

type Carousel = {
  root: HTMLElement;
  track: HTMLElement;
  slides: HTMLElement[];
  loop: boolean;
  index: number;
  prev?: HTMLButtonElement;
  next?: HTMLButtonElement;
  dotsBox?: HTMLElement;
  dots: HTMLButtonElement[];
  timer?: ReturnType<typeof setInterval>;
  /** The visitor pressed Pause (or reduced motion started it paused). */
  stopped: boolean;
  /** Hovered or holding focus: paused for now, until both have ended (W-1058). */
  hovered: boolean;
  focused: boolean;
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

/** How far each slide starts from the first, in scroll pixels (positive in RTL too). */
const offsets = (c: Carousel): number[] => {
  const origin = c.slides[0]?.offsetLeft ?? 0;
  return c.slides.map((slide) => Math.abs(slide.offsetLeft - origin));
};

/** The slide the track is scrolled to: the nearest real offset, so gaps and RTL count (W-1057). */
function scrolledIndex(c: Carousel): number {
  const at = Math.abs(c.track.scrollLeft);
  let best = 0;
  offsets(c).forEach((offset, i, all) => {
    if (Math.abs(offset - at) < Math.abs((all[best] ?? 0) - at)) best = i;
  });
  return Math.min(best, lastStart(c));
}

/** One dot per start position the current view can reach; rebuilt when that number changes. */
function renderDots(c: Carousel): void {
  if (!c.dotsBox) return;
  const count = lastStart(c) + 1;
  if (c.dots.length === count) return;
  const focusedAt = c.dots.findIndex((dot) => dot === document.activeElement);
  c.dots = [];
  for (let i = 0; i < count; i++) {
    const dot = button(`Go to slide ${i + 1}`, "");
    dot.addEventListener("click", () => go(c, i, false));
    c.dots.push(dot);
  }
  c.dotsBox.replaceChildren(...c.dots);
  if (focusedAt >= 0) c.dots[Math.min(focusedAt, count - 1)]?.focus();
}

/** Re-reads the layout after a resize or once a hidden carousel can be measured. */
function refresh(c: Carousel): void {
  renderDots(c);
  c.index = scrolledIndex(c);
  update(c);
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
    hovered: false,
    focused: false,
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
    c.dotsBox = document.createElement("div");
    c.dotsBox.className = "emvb-carousel-dots";
    renderDots(c);
    controls.append(...present([c.prev, c.dotsBox, c.next]));
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
      if ((c.slides[0]?.offsetWidth ?? 0) <= 0) return;
      c.index = scrolledIndex(c);
      update(c);
    });
  });
  if (typeof ResizeObserver === "function") new ResizeObserver(() => refresh(c)).observe(track);
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
    if (!c.stopped && !c.hovered && !c.focused) go(c, c.index + 1, true);
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
  c.root.addEventListener("pointerenter", () => {
    c.hovered = true;
  });
  c.root.addEventListener("pointerleave", () => {
    c.hovered = false;
  });
  c.root.addEventListener("focusin", () => {
    c.focused = true;
  });
  c.root.addEventListener("focusout", (event) => {
    if (!c.root.contains(event.relatedTarget as Node | null)) c.focused = false;
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
