import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { initCountdowns, remaining } from "./countdown.ts";

const TARGET = "2026-12-01T09:00Z";
const at = (iso: string) => setSystemTime(new Date(iso));

function fixture(expired = "text") {
  document.body.innerHTML = `
    <div class="emvb-countdown" data-emvb-countdown data-target="${TARGET}" data-expired="${expired}">
      <p class="emvb-countdown-target">Ends <time datetime="${TARGET}">1 Dec 2026, 09:00 UTC</time></p>
      <div class="emvb-countdown-clock">
        <div class="emvb-countdown-units" aria-hidden="true">
          <span class="emvb-countdown-num" data-unit="days">00</span>
          <span class="emvb-countdown-num" data-unit="hours">00</span>
          <span class="emvb-countdown-num" data-unit="minutes">00</span>
          <span class="emvb-countdown-num" data-unit="seconds">00</span>
        </div>
        <button type="button" class="emvb-countdown-pause" aria-pressed="false">Pause</button>
      </div>
      <p class="emvb-countdown-expired">Ended</p>
    </div>`;
  return document.querySelector<HTMLElement>(".emvb-countdown") as HTMLElement;
}
const nums = () =>
  [...document.querySelectorAll(".emvb-countdown-num")].map((el) => el.textContent).join(":");

afterEach(() => {
  for (const pause of document.querySelectorAll<HTMLButtonElement>(
    ".emvb-countdown-pause[aria-pressed='false']",
  ))
    pause.click();
  document.body.innerHTML = "";
  setSystemTime();
});

describe("countdown runtime (W-1040)", () => {
  test("remaining splits the time left and stops at zero", () => {
    const target = Date.parse(TARGET);
    expect(remaining(target, target - (2 * 86_400 + 3 * 3600 + 4 * 60 + 5) * 1000)).toMatchObject({
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 5,
    });
    expect(remaining(target, target + 5000).total).toBe(0);
  });

  test("marks it ready and fills in the time left", () => {
    at("2026-11-29T07:58:30Z");
    const root = fixture();
    initCountdowns(document);
    expect(root.dataset["emvbReady"]).toBe("");
    expect(nums()).toBe("02:01:01:30");
  });

  test("once time is up it shows the ended text and hides the clock", () => {
    at("2026-12-01T09:00:01Z");
    const root = fixture();
    initCountdowns(document);
    expect(root.querySelector(".emvb-countdown-expired")?.hasAttribute("data-emvb-shown")).toBe(
      true,
    );
    expect(root.querySelector<HTMLElement>(".emvb-countdown-clock")?.hidden).toBe(true);
    expect(root.hidden).toBe(false);
  });

  test("with hide, the whole countdown goes when time is up", () => {
    at("2026-12-02T00:00Z");
    const root = fixture("hide");
    initCountdowns(document);
    expect(root.hidden).toBe(true);
  });

  test("Pause stops the clock and says so; pressing again resumes", () => {
    // Timers the test runs by hand: each tick is one call of the live intervals.
    const live = new Map<number, () => void>();
    let next = 0;
    const realSet = globalThis.setInterval;
    const realClear = globalThis.clearInterval;
    globalThis.setInterval = ((fn: () => void) => {
      live.set(++next, fn);
      return next;
    }) as unknown as typeof setInterval;
    globalThis.clearInterval = ((id: number) => {
      live.delete(id);
    }) as unknown as typeof clearInterval;
    const tick = () => {
      for (const fn of live.values()) fn();
    };
    try {
      at("2026-11-30T09:00:00Z");
      const root = fixture();
      initCountdowns(document);
      const pause = root.querySelector<HTMLButtonElement>(
        ".emvb-countdown-pause",
      ) as HTMLButtonElement;
      at("2026-11-30T09:00:05Z");
      tick();
      expect(nums()).toBe("00:23:59:55");
      pause.click();
      expect(pause.getAttribute("aria-pressed")).toBe("true");
      at("2026-11-30T09:00:10Z");
      tick();
      // A paused clock isn't redrawn, so it still shows the time it was paused at.
      expect(nums()).toBe("00:23:59:55");
      pause.click();
      expect(pause.getAttribute("aria-pressed")).toBe("false");
      expect(nums()).toBe("00:23:59:50");
    } finally {
      globalThis.setInterval = realSet;
      globalThis.clearInterval = realClear;
    }
  });

  test("running twice wires each countdown once", () => {
    at("2026-11-30T09:00:00Z");
    const root = fixture();
    initCountdowns(document);
    initCountdowns(document);
    const pause = root.querySelector<HTMLButtonElement>(
      ".emvb-countdown-pause",
    ) as HTMLButtonElement;
    pause.click();
    expect(pause.getAttribute("aria-pressed")).toBe("true");
  });

  test("the ended text waits for the target itself, not the last whole second (W-1060)", () => {
    const intervals: (() => void)[] = [];
    const timeouts: { fn: () => void; ms: number }[] = [];
    const real = {
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    };
    globalThis.setInterval = ((fn: () => void) =>
      intervals.push(fn)) as unknown as typeof setInterval;
    globalThis.clearInterval = (() => undefined) as unknown as typeof clearInterval;
    globalThis.setTimeout = ((fn: () => void, ms: number) =>
      timeouts.push({ fn, ms })) as unknown as typeof setTimeout;
    globalThis.clearTimeout = (() => undefined) as unknown as typeof clearTimeout;
    const shown = (root: HTMLElement) =>
      root.querySelector(".emvb-countdown-expired")?.hasAttribute("data-emvb-shown") === true;
    try {
      at("2026-12-01T08:59:59.700Z");
      const root = fixture();
      initCountdowns(document);
      expect(shown(root)).toBe(false);
      expect(timeouts.map((t) => t.ms)).toEqual([300]);
      at("2026-12-01T08:59:59.900Z");
      intervals[0]?.();
      expect(shown(root)).toBe(false);
      at("2026-12-01T09:00:00Z");
      timeouts[0]?.fn();
      expect(shown(root)).toBe(true);
    } finally {
      Object.assign(globalThis, real);
    }
  });
});
