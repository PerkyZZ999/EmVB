import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { initPopups } from "./runtime.ts";

type Timer = { id: number; ms: number; run: () => void };
let timers: Timer[] = [];
// Ids stay unique across tests: listeners from earlier popups still clear their own timers.
let lastId = 0;
let timeoutSpy: ReturnType<typeof spyOn>;
let clearSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  timers = [];
  timeoutSpy = spyOn(window, "setTimeout").mockImplementation(((run: () => void, ms?: number) => {
    lastId += 1;
    timers.push({ id: lastId, ms: ms ?? 0, run });
    return lastId;
  }) as unknown as typeof window.setTimeout);
  clearSpy = spyOn(window, "clearTimeout").mockImplementation(() => undefined);
});

afterEach(() => {
  timeoutSpy.mockRestore();
  clearSpy.mockRestore();
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

  test("a click inside the selector opens it; clicks elsewhere, blank and broken selectors don't", () => {
    const button = document.createElement("button");
    button.className = "open-me";
    button.innerHTML = "<span>Go</span>";
    const other = document.createElement("p");
    const root = popup(
      "c1",
      doc([
        { type: "click", selector: "  .open-me " },
        { type: "click", selector: "  " },
        { type: "click", selector: "[[" },
      ]),
    );
    document.body.append(button, other);
    other.click();
    expect(root.hidden).toBe(true);
    button.querySelector("span")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(root.hidden).toBe(false);
  });

  test("exit intent opens only when the pointer leaves through the top", () => {
    const root = popup("e1", doc([{ type: "exit_intent" }]));
    document.documentElement.dispatchEvent(new MouseEvent("mouseleave", { clientY: 40 }));
    expect(root.hidden).toBe(true);
    document.documentElement.dispatchEvent(new MouseEvent("mouseleave", { clientY: 0 }));
    expect(root.hidden).toBe(false);
  });

  test("activity restarts the inactivity timer; unknown triggers are ignored", () => {
    const root = popup("i1", doc([{ type: "inactivity", ms: 2500 }, { type: "hover" }]));
    const idle = () => timers.filter((t) => t.ms === 2500);
    expect(timers.length).toBe(1);
    window.dispatchEvent(new Event("keydown"));
    window.dispatchEvent(new Event("mousemove"));
    expect(idle().length).toBe(3);
    const first = idle()[0]?.id;
    expect(clearSpy.mock.calls.filter((call: unknown[]) => call[0] === first).length).toBe(1);
    expect(root.hidden).toBe(true);
    idle().at(-1)?.run();
    expect(root.hidden).toBe(false);
  });
});
