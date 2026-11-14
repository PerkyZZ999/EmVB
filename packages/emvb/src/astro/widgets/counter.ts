/**
 * W-1038: the opt-in Counter runtime. A Counter that asks for it counts up from its start to its
 * number when it scrolls into view. The page is rendered with the final number, so without this
 * script, and under reduced motion, visitors see that at once. While it counts, screen readers
 * get the final number from a hidden copy instead of every step.
 */
import { formatCounter } from "../../core/elements/counter-format.ts";

type Counter = {
  el: HTMLElement;
  from: number;
  to: number;
  decimals: number;
  separator: string;
  duration: number;
  final: string;
};

const easeOut = (t: number) => 1 - (1 - t) ** 3;

function read(el: HTMLElement): Counter | undefined {
  const num = (key: string, fallback: number) => {
    const value = Number(el.dataset[key] ?? fallback);
    return Number.isFinite(value) ? value : fallback;
  };
  const to = Number(el.dataset["to"]);
  if (!Number.isFinite(to)) return undefined;
  return {
    el,
    from: num("from", 0),
    to,
    decimals: Math.min(3, Math.max(0, Math.round(num("decimals", 0)))),
    separator: el.dataset["separator"] ?? "",
    duration: Math.min(5000, Math.max(0, num("duration", 2000))),
    final: el.textContent ?? "",
  };
}

/** Shows `c.from`, with the final number kept for screen readers. */
function prepare(c: Counter): void {
  c.el.setAttribute("aria-hidden", "true");
  const copy = c.el.ownerDocument.createElement("span");
  copy.className = "emvb-counter-sr";
  copy.textContent = c.final;
  c.el.after(copy);
  c.el.textContent = formatCounter(c.from, c.decimals, c.separator);
}

/** Ends on the rendered text, and gives the number back to screen readers. */
function finish(c: Counter): void {
  c.el.textContent = c.final;
  c.el.removeAttribute("aria-hidden");
  const copy = c.el.nextElementSibling;
  if (copy?.classList.contains("emvb-counter-sr")) copy.remove();
}

function run(c: Counter): void {
  const began = performance.now();
  const step = (now: number) => {
    const t = c.duration > 0 ? Math.min(1, (now - began) / c.duration) : 1;
    if (t >= 1) {
      finish(c);
      return;
    }
    const value = c.from + (c.to - c.from) * easeOut(t);
    c.el.textContent = formatCounter(value, c.decimals, c.separator);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function initCounters(root: ParentNode = document): void {
  const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  if (reduced || typeof IntersectionObserver === "undefined") return;
  const counters = new Map<Element, Counter>();
  for (const el of root.querySelectorAll<HTMLElement>("[data-emvb-counter]")) {
    if (el.dataset["emvbReady"] !== undefined) continue;
    el.dataset["emvbReady"] = "";
    const c = read(el);
    if (!c || c.from === c.to) continue;
    prepare(c);
    counters.set(el, c);
  }
  if (counters.size === 0) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const c = counters.get(entry.target);
        if (!entry.isIntersecting || !c) continue;
        observer.unobserve(entry.target);
        counters.delete(entry.target);
        run(c);
      }
    },
    { threshold: 0.5 },
  );
  for (const el of counters.keys()) observer.observe(el);
}
