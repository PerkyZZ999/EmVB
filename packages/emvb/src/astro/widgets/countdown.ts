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
  let finish: ReturnType<typeof setTimeout> | undefined;
  const halt = () => {
    if (timer !== undefined) clearInterval(timer);
    if (finish !== undefined) clearTimeout(finish);
    timer = undefined;
    finish = undefined;
  };

  const end = () => {
    halt();
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
    // W-1060: time is up only when the clock reaches the target, not when the whole seconds
    // left round down to zero; the last part-second gets its own timer so the end isn't late.
    const ms = target - Date.now();
    if (ms <= 0) end();
    else if (ms < 1000 && finish === undefined)
      finish = setTimeout(() => {
        finish = undefined;
        tick();
      }, ms);
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
    else halt();
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
