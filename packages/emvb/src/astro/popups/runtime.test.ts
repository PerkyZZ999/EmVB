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

// W-091: survivors in the popup runtime (Stryker 79%).
describe("public popup runtime details (W-091)", () => {
  const escape = (root: HTMLElement) => {
    const dialog = root.querySelector(".emvb-popup__dialog");
    if (!dialog) throw new Error("no dialog");
    return key(dialog, "Escape");
  };

  test("each show is counted under emvb-popup-shown:<id>", () => {
    popup("count1", doc([{ type: "page_load" }]));
    expect(localStorage.getItem("emvb-popup-shown:count1")).toBe("1");
  });

  test("a corrupt stored count counts as never shown", () => {
    const opens = (stored: string) => {
      document.body.innerHTML = "";
      localStorage.setItem("emvb-popup-shown:bad", stored);
      const shown = !popup("bad", doc([{ type: "page_load" }], { showTimes: 1 })).hidden;
      return [shown, localStorage.getItem("emvb-popup-shown:bad")];
    };
    expect([opens("garbage"), opens("-3"), opens("Infinity")]).toEqual([
      [true, "1"],
      [true, "1"],
      [true, "1"],
    ]);
  });

  test("a browser that blocks storage still shows a capped popup", () => {
    const real = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    const blocked = () => {
      throw new Error("blocked");
    };
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: blocked, setItem: blocked, clear: () => undefined },
    });
    try {
      expect(popup("blocked", doc([{ type: "page_load" }], { showTimes: 1 })).hidden).toBe(false);
    } finally {
      if (real) Object.defineProperty(globalThis, "localStorage", real);
    }
  });

  test("a config whose id isn't a string is left alone", () => {
    const root = document.createElement("div");
    root.setAttribute("data-emvb-popup", "");
    root.setAttribute(
      "data-emvb-popup-config",
      JSON.stringify({ id: 7, triggers: doc([{ type: "page_load" }]) }),
    );
    root.hidden = true;
    root.innerHTML = '<div class="emvb-popup__dialog" tabindex="-1"></div>';
    document.body.append(root);
    initPopups();
    expect(root.hidden).toBe(true);
  });

  test("a second trigger while open keeps the focus to give back; closed popups reopen", () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    const root = popup(
      "twice",
      doc([
        { type: "delay", ms: 0 },
        { type: "delay", ms: 0 },
      ]),
    );
    const [first, second] = timers;
    first?.run();
    second?.run();
    escape(root);
    expect(document.activeElement === outside).toBe(true);
    expect(root.hidden).toBe(true);
    first?.run();
    expect(root.hidden).toBe(false);
  });

  test("two triggers in one visit count one show, and a later reopen counts again (W-092)", () => {
    const root = popup(
      "both",
      doc(
        [
          { type: "delay", ms: 0 },
          { type: "delay", ms: 10 },
        ],
        { showTimes: 2 },
      ),
    );
    const [first, second] = timers;
    first?.run();
    second?.run();
    expect(localStorage.getItem("emvb-popup-shown:both")).toBe("1");
    escape(root);
    first?.run();
    expect([root.hidden, localStorage.getItem("emvb-popup-shown:both")]).toEqual([false, "2"]);
  });

  test("Escape on a closed popup doesn't move focus again", () => {
    const outside = document.createElement("button");
    const elsewhere = document.createElement("button");
    document.body.append(outside, elsewhere);
    outside.focus();
    const { root, open } = openablePopup("closed", "<button>Join</button>");
    open();
    escape(root);
    elsewhere.focus();
    escape(root);
    expect(document.activeElement === elsewhere).toBe(true);
  });

  test("opening and closing move focus without scrolling the page", () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    const calls: unknown[] = [];
    outside.focus = (options?: FocusOptions) => {
      calls.push(["outside", options]);
    };
    const { root, dialog, open } = openablePopup("scroll-free", "<button>Join</button>");
    dialog.focus = (options?: FocusOptions) => {
      calls.push(["dialog", options]);
    };
    open();
    escape(root);
    expect(calls).toEqual([
      ["dialog", { preventScroll: true }],
      ["outside", { preventScroll: true }],
    ]);
  });

  test("Tab skips disabled and tabindex -1 controls when finding the last one", () => {
    const { dialog, open } = openablePopup(
      "skip",
      '<a href="/terms">Terms</a><button>Join</button><input disabled><a href="/x" tabindex="-1">X</a>',
    );
    open();
    const [first, join] = [...dialog.querySelectorAll<HTMLElement>("a, button")];
    if (!first || !join) throw new Error("missing controls");
    join.focus();
    expect(key(join, "Tab").defaultPrevented).toBe(true);
    expect(document.activeElement === first).toBe(true);
  });

  test("only Tab is trapped, and Shift+Tab away from the first control is left to the browser", () => {
    const { dialog, open } = openablePopup(
      "keys",
      '<a href="/a">A</a><button>B</button><button>C</button>',
    );
    open();
    const [, middle, last] = [...dialog.querySelectorAll<HTMLElement>("a, button")];
    if (!middle || !last) throw new Error("missing controls");
    last.focus();
    expect(key(last, "Enter").defaultPrevented).toBe(false);
    expect(document.activeElement === last).toBe(true);
    middle.focus();
    expect(key(middle, "Tab", true).defaultPrevented).toBe(false);
    expect(document.activeElement === middle).toBe(true);
  });

  test("with nothing to focus, Tab brings focus back to the dialog", () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    const { dialog, open } = openablePopup("empty", "<p>Just text</p>");
    open();
    outside.focus();
    expect(key(dialog, "Tab").defaultPrevented).toBe(true);
    expect(document.activeElement === dialog).toBe(true);
  });

  test("a page no taller than the window counts as fully scrolled", () => {
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1000 });
    expect(popup("short", doc([{ type: "scroll", percent: 50 }])).hidden).toBe(false);
  });

  test("scroll and exit intent open once: after closing, more scrolling or leaving doesn't reopen", () => {
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      value: 2000,
    });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1000 });
    Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: 0 });
    const scrolled = popup("once-s", doc([{ type: "scroll", percent: 50 }]));
    (window as { scrollY: number }).scrollY = 600;
    window.dispatchEvent(new Event("scroll"));
    expect(scrolled.hidden).toBe(false);
    escape(scrolled);
    window.dispatchEvent(new Event("scroll"));
    expect(scrolled.hidden).toBe(true);

    const left = popup("once-e", doc([{ type: "exit_intent" }]));
    document.documentElement.dispatchEvent(new MouseEvent("mouseleave", { clientY: 0 }));
    expect(left.hidden).toBe(false);
    escape(left);
    document.documentElement.dispatchEvent(new MouseEvent("mouseleave", { clientY: 0 }));
    expect(left.hidden).toBe(true);
  });

  test("W-279: inactivity opens once; after closing, more idling doesn't reopen", () => {
    const root = popup("once-i", doc([{ type: "inactivity", ms: 2000 }]));
    timers.at(-1)?.run();
    expect(root.hidden).toBe(false);
    escape(root);
    const before = timers.length;
    window.dispatchEvent(new Event("mousemove"));
    window.dispatchEvent(new Event("keydown"));
    // Popups from earlier tests still listen on window; run every new timer.
    for (const timer of timers.slice(before)) timer.run();
    expect(root.hidden).toBe(true);
  });

  test("W-279: Tab wraps from the last control that can take focus, past hidden inputs", () => {
    const { dialog, open } = openablePopup(
      "form",
      '<input name="email"><button>Join</button><input type="hidden" name="formId" value="f">' +
        '<div hidden><button>Hidden</button></div><div inert><a href="/x">Inert</a></div>',
    );
    open();
    const [email, join] = [...dialog.querySelectorAll<HTMLElement>("input, button")];
    if (!email || !join) throw new Error("missing controls");
    join.focus();
    expect(key(join, "Tab").defaultPrevented).toBe(true);
    expect(document.activeElement === email).toBe(true);
    expect(key(email, "Tab", true).defaultPrevented).toBe(true);
    expect(document.activeElement === join).toBe(true);
  });

  test("scroll and activity listeners are passive", () => {
    const listen = spyOn(window, "addEventListener");
    try {
      Object.defineProperty(document.documentElement, "scrollHeight", {
        configurable: true,
        value: 2000,
      });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 1000 });
      popup(
        "passive",
        doc([
          { type: "scroll", percent: 90 },
          { type: "inactivity", ms: 5000 },
        ]),
      );
      const options = listen.mock.calls.map(([type, , opts]) => [type, opts]);
      expect(options).toEqual([
        ["scroll", { passive: true }],
        ["mousemove", { passive: true }],
        ["mousedown", { passive: true }],
        ["keydown", { passive: true }],
        ["touchstart", { passive: true }],
        ["scroll", { passive: true }],
      ]);
    } finally {
      listen.mockRestore();
    }
  });
});
