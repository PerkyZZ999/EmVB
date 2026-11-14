/**
 * W-1040: the opt-in Countdown runtime. It shows each ticking Countdown's clock (hidden by CSS
 * until this script marks it ready) and updates it every second. The clock is hidden from
 * screen readers, which read the sentence with the date instead of a number every second. A
 * Pause button stops the updates (WCAG 2.2.2). When time is up it shows the ended text, or hides
 * the Countdown.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** Whole days, hours, minutes and seconds left until `target`, never below zero. */
export function remaining(target: number, now: number) {
  const total = Math.max(0, Math.floor((target - now) / 1000));
  return {
    total,
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

function start(root: HTMLElement, target: number): void {
  const nums = new Map<string, HTMLElement>();
  for (const el of root.querySelectorAll<HTMLElement>(".emvb-countdown-num[data-unit]"))
    nums.set(el.dataset["unit"] ?? "", el);
  const pause = root.querySelector<HTMLButtonElement>(".emvb-countdown-pause");
  let timer: ReturnType<typeof setInterval> | undefined;

  const end = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    if (root.dataset["expired"] === "hide") {
      root.hidden = true;
      return;
    }
    const clock = root.querySelector<HTMLElement>(".emvb-countdown-clock");
    if (clock) clock.hidden = true;
    root.querySelector<HTMLElement>(".emvb-countdown-expired")?.setAttribute("data-emvb-shown", "");
  };

  const tick = () => {
    const left = remaining(target, Date.now());
    const hasSeconds = nums.has("seconds");
    // Without seconds, the days to minutes left round up, so the clock never shows 0 too early.
    const shown = hasSeconds ? left : remaining(target + 59_000, Date.now());
    for (const unit of ["days", "hours", "minutes", "seconds"] as const) {
      const el = nums.get(unit);
      if (el) el.textContent = pad(shown[unit]);
    }
    if (left.total === 0) end();
  };

  const run = () => {
    tick();
    if (root.hidden || root.querySelector(".emvb-countdown-clock[hidden]")) return;
    timer = setInterval(tick, 1000);
  };

  pause?.addEventListener("click", () => {
    const paused = pause.getAttribute("aria-pressed") === "true";
    pause.setAttribute("aria-pressed", String(!paused));
    if (paused) run();
    else if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  });
  run();
}

export function initCountdowns(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-emvb-countdown]")) {
    if (el.dataset["emvbReady"] !== undefined) continue;
    const target = Date.parse(el.dataset["target"] ?? "");
    if (Number.isNaN(target)) continue;
    el.dataset["emvbReady"] = "";
    start(el, target);
  }
}
