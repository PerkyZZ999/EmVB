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

  test("a broken click selector is dropped once instead of throwing on every click", () => {
    const listen = spyOn(document, "addEventListener");
    popup(
      "c2",
      doc([
        { type: "click", selector: "a[" },
        { type: "click", selector: ".ok" },
      ]),
    );
    expect(listen.mock.calls.filter(([type]) => type === "click")).toHaveLength(1);
    listen.mockRestore();
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

/** A popup that opens at once, with `inner` markup in its dialog; returns its parts after init. */
function openablePopup(id: string, inner: string) {
  const root = popup(id, doc([{ type: "delay", ms: 0 }]));
  const dialog = root.querySelector<HTMLElement>(".emvb-popup__dialog");
  if (!dialog) throw new Error("no dialog");
  dialog.innerHTML = inner;
  const open = () => timers.at(-1)?.run();
  return { root, dialog, open };
}

const key = (target: Element, name: string, shiftKey = false) => {
  const event = new KeyboardEvent("keydown", {
    key: name,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
};

describe("public popup keyboard and focus (S7b, W-081)", () => {
  test("opening shows the popup and focuses its dialog; Escape hides it and gives focus back", () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    const { root, dialog, open } = openablePopup("k1", "<button>Join</button>");
    open();
    expect(root.hidden).toBe(false);
    expect(document.activeElement === dialog).toBe(true);
    const escape = key(dialog, "Escape");
    expect(escape.defaultPrevented).toBe(true);
    expect(root.hidden).toBe(true);
    expect(document.activeElement === outside).toBe(true);
  });

  test("a click inside a dismiss control closes the popup; other clicks don't", () => {
    const { root, dialog, open } = openablePopup(
      "k2",
      '<p>Offer</p><button data-emvb-popup-dismiss=""><span>Close</span></button>',
    );
    open();
    dialog.querySelector("p")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(root.hidden).toBe(false);
    dialog.querySelector("span")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(root.hidden).toBe(true);
  });

  test("Tab wraps from the last control to the first, Shift+Tab from the first to the last", () => {
    const { dialog, open } = openablePopup(
      "k3",
      '<a href="/terms">Terms</a><button disabled>Off</button><button>Join</button>',
    );
    open();
    const [first, , last] = [...dialog.querySelectorAll<HTMLElement>("a, button")];
    if (!first || !last) throw new Error("missing controls");
    last.focus();
    expect(key(last, "Tab").defaultPrevented).toBe(true);
    expect(document.activeElement === first).toBe(true);
    expect(key(first, "Tab", true).defaultPrevented).toBe(true);
    expect(document.activeElement === last).toBe(true);
    // Away from the ends the browser moves focus itself.
    first.focus();
    expect(key(first, "Tab").defaultPrevented).toBe(false);
  });

  test("a popup with nothing to focus keeps Tab on its dialog", () => {
    const { dialog, open } = openablePopup("k4", "<p>Just text</p>");
    open();
    const tab = key(dialog, "Tab");
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement === dialog).toBe(true);
  });

  test("a popup whose config is unreadable, has no open triggers or has no dialog is left alone", () => {
    const bad = document.createElement("div");
    bad.setAttribute("data-emvb-popup", "");
    bad.setAttribute("data-emvb-popup-config", "{not json");
    bad.innerHTML = '<div class="emvb-popup__dialog"></div>';
    const noTriggers = bad.cloneNode(true) as HTMLElement;
    noTriggers.setAttribute("data-emvb-popup-config", JSON.stringify({ id: "n1", triggers: {} }));
    const noDialog = document.createElement("div");
    noDialog.setAttribute("data-emvb-popup", "");
    noDialog.setAttribute(
      "data-emvb-popup-config",
      JSON.stringify({ id: "n2", triggers: doc([{ type: "delay", ms: 0 }]) }),
    );
    document.body.append(bad, noTriggers, noDialog);
    initPopups();
    expect(timers).toEqual([]);
  });
});
