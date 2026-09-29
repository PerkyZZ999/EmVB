import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { initPopups } from "./runtime.ts";

type Timer = { ms: number; run: () => void };
let timers: Timer[] = [];
let timeoutSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  timers = [];
  timeoutSpy = spyOn(window, "setTimeout").mockImplementation(((run: () => void, ms?: number) => {
    timers.push({ ms: ms ?? 0, run });
    return timers.length;
  }) as unknown as typeof window.setTimeout);
});

afterEach(() => {
  timeoutSpy.mockRestore();
  document.body.innerHTML = "";
  localStorage.clear();
  for (const key of ["innerWidth", "innerHeight", "scrollY"]) Reflect.deleteProperty(window, key);
  Reflect.deleteProperty(document.documentElement, "scrollHeight");
});

/** Adds a closed popup with `triggers` to the page, starts the runtime, and returns its root. */
function popup(id: string, triggers: unknown): HTMLElement {
  const root = document.createElement("div");
  root.setAttribute("data-emvb-popup", "");
  root.setAttribute("data-emvb-popup-config", JSON.stringify({ id, triggers }));
  root.hidden = true;
  const dialog = document.createElement("div");
  dialog.className = "emvb-popup__dialog";
  dialog.tabIndex = -1;
  root.append(dialog);
  document.body.append(root);
  initPopups();
  return root;
}

const doc = (open: unknown[], advanced: unknown = {}) => ({ schemaVersion: 1, open, advanced });

describe("public popup runtime (S7b, W-081)", () => {
  test("a delay waits its time, and a missing or negative delay opens at once", () => {
    popup("p1", doc([{ type: "delay", ms: 4500 }, { type: "delay", ms: -20 }, { type: "delay" }]));
    expect(timers.map((t) => t.ms)).toEqual([4500, 0, 0]);
  });

  test("inactivity waits at least 1 000 ms and 30 000 ms when unset", () => {
    popup(
      "p2",
      doc([
        { type: "inactivity", ms: 10 },
        { type: "inactivity" },
        { type: "inactivity", ms: 5000 },
      ]),
    );
    expect(timers.map((t) => t.ms)).toEqual([1000, 30_000, 5000]);
    const root = document.querySelector<HTMLElement>("[data-emvb-popup]");
    timers[0]?.run();
    expect(root?.hidden).toBe(false);
  });

  test("scroll percent is clamped: over 100 waits for the bottom, below 0 opens at once", () => {
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      value: 2000,
    });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1000 });
    Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: 990 });
    const over = popup("p3", doc([{ type: "scroll", percent: 150 }]));
    expect(over.hidden).toBe(true);
    (window as { scrollY: number }).scrollY = 1000;
    window.dispatchEvent(new Event("scroll"));
    expect(over.hidden).toBe(false);
    document.body.innerHTML = "";
    (window as { scrollY: number }).scrollY = 0;
    expect(popup("p4", doc([{ type: "scroll", percent: -10 }])).hidden).toBe(false);
  });

  test("devices limit where a popup opens, by viewport width", () => {
    const at = (width: number, devices: string[] | null) => {
      document.body.innerHTML = "";
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
      return !popup(`d${width}`, doc([{ type: "page_load" }], { devices })).hidden;
    };
    expect([at(767, ["mobile"]), at(768, ["mobile"]), at(768, ["tablet"])]).toEqual([
      true,
      false,
      true,
    ]);
    expect([at(1024, ["tablet"]), at(1025, ["tablet"]), at(1025, ["desktop"])]).toEqual([
      true,
      false,
      true,
    ]);
    expect([at(500, []), at(500, null)]).toEqual([true, true]);
  });

  test("show times caps how often a popup opens on this browser", () => {
    const opens = () => {
      document.body.innerHTML = "";
      return !popup("capped", doc([{ type: "page_load" }], { showTimes: 2 })).hidden;
    };
    expect([opens(), opens(), opens()]).toEqual([true, true, false]);
    localStorage.clear();
    document.body.innerHTML = "";
    expect(popup("free", doc([{ type: "page_load" }], { showTimes: null })).hidden).toBe(false);
  });
});
