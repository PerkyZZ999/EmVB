/**
 * W-1046: the opt-in Animated headline runtime. Each headline with rotating words shows them in
 * turn in its highlight, every `data-interval` seconds for `data-turns` rounds, and stops on the
 * first word. A Pause button after the heading stops it at any time (WCAG 2.2.2). Screen readers
 * keep the sentence with the first word: the changing words are hidden from them meanwhile.
 * Under reduced motion nothing rotates and no button is added.
 */

type Rotation = { words: string[]; interval: number; turns: number };

function read(mark: HTMLElement): Rotation | undefined {
  let words: unknown;
  try {
    words = JSON.parse(mark.dataset["emvbRotate"] ?? "");
  } catch {
    return undefined;
  }
  if (!Array.isArray(words)) return undefined;
  const list = words.filter((w): w is string => typeof w === "string" && w.trim() !== "");
  if (list.length < 2) return undefined;
  const interval = Number(mark.dataset["interval"]);
  const turns = Number(mark.dataset["turns"]);
  return {
    words: list,
    interval: Number.isFinite(interval) ? Math.min(10, Math.max(1.5, interval)) : 2.5,
    turns: Number.isFinite(turns) ? Math.min(5, Math.max(1, Math.round(turns))) : 2,
  };
}

function start(mark: HTMLElement, r: Rotation): void {
  const doc = mark.ownerDocument;
  const heading = mark.closest("h1, h2, h3, h4, h5, h6") ?? mark;
  // The word changes in its own text node; the circle (if any) stays.
  const found = [...mark.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
  if (!found) return;
  const text: Node = found;
  const spoken = doc.createElement("span");
  spoken.className = "emvb-headline-sr";
  spoken.textContent = r.words[0] ?? "";
  mark.before(spoken);
  mark.setAttribute("aria-hidden", "true");

  const pause = doc.createElement("button");
  pause.type = "button";
  pause.className = "emvb-headline-pause";
  pause.setAttribute("aria-pressed", "false");
  pause.textContent = "Pause";
  heading.after(pause);

  let step = 0;
  const last = r.words.length * r.turns;
  const timer = setInterval(() => {
    step++;
    text.textContent = r.words[step % r.words.length] ?? "";
    if (step < last) return;
    // W-1059: the button goes away at the end; if it had focus, focus moves on as after Pause.
    const focused = doc.activeElement === pause;
    const next = pause.nextElementSibling;
    stop();
    if (focused) moveOn(next);
  }, r.interval * 1000);

  function stop(): void {
    clearInterval(timer);
    text.textContent = r.words[0] ?? "";
    mark.removeAttribute("aria-hidden");
    spoken.remove();
    pause.remove();
  }
  /** Focus after the removed button: the control that followed it, else the heading. */
  function moveOn(next: Element | null): void {
    if (
      next instanceof HTMLElement &&
      next.matches("a[href], button, input, select, textarea, [tabindex]")
    )
      next.focus();
    else if (heading instanceof HTMLElement) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }
  // Pausing ends the rotation for good, back on the first word.
  pause.addEventListener("click", () => {
    const next = pause.nextElementSibling;
    stop();
    moveOn(next);
  });
}

export function initHeadlines(root: ParentNode = document): void {
  const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  if (reduced) return;
  for (const mark of root.querySelectorAll<HTMLElement>("[data-emvb-rotate]")) {
    if (mark.dataset["emvbReady"] !== undefined) continue;
    mark.dataset["emvbReady"] = "";
    const r = read(mark);
    if (r) start(mark, r);
  }
}
