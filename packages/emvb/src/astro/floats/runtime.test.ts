import { afterEach, describe, expect, test } from "bun:test";
import { initFloats } from "./runtime.ts";

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.style.cssText = "";
  sessionStorage.clear();
  delete document.documentElement.dataset["emvbFloatsReady"];
});

function mount(dismiss: boolean) {
  document.body.innerHTML = [
    `<aside class="emvb-float emvb-float--top" data-emvb-float="bar1" data-emvb-float-edge="top">`,
    dismiss ? `<button type="button" data-emvb-float-dismiss>Close</button>` : "",
    `<p>Notice</p></aside>`,
  ].join("");
  const bar = document.querySelector("aside");
  if (bar) {
    bar.getBoundingClientRect = () =>
      ({
        height: 40,
        width: 100,
        top: 0,
        left: 0,
        bottom: 40,
        right: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
  }
}

describe("float runtime", () => {
  test("a top bar reserves its height", () => {
    mount(false);
    initFloats();
    expect(document.documentElement.style.getPropertyValue("--emvb-float-top")).toBe("40px");
  });

  test("closing a bar hides it for this visit and drops the reserved space", () => {
    mount(true);
    initFloats();
    const button = document.querySelector("[data-emvb-float-dismiss]");
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const bar = document.querySelector<HTMLElement>("[data-emvb-float]");
    expect(bar?.hidden).toBe(true);
    expect(sessionStorage.getItem("emvb-float-closed:bar1")).toBe("1");
    expect(document.documentElement.style.getPropertyValue("--emvb-float-top")).toBe("0px");
  });
});

describe("float bars follow their own size (W-407)", () => {
  test("a bar that grows without a window resize updates the reserved space", () => {
    const callbacks: (() => void)[] = [];
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(callback: () => void) {
        callbacks.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    try {
      mount(false);
      initFloats();
      const bar = document.querySelector("aside") as HTMLElement;
      bar.getBoundingClientRect = () => ({ height: 64 }) as DOMRect;
      for (const callback of callbacks) callback();
      expect(document.documentElement.style.getPropertyValue("--emvb-float-top")).toBe("64px");
    } finally {
      globalThis.ResizeObserver = original;
    }
  });
  test("W-782 closing the focused float moves focus to the next control, not <body>", () => {
    mount(true);
    document.body.insertAdjacentHTML("afterbegin", `<a href="#a" id="before">Before</a>`);
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div hidden><a href="#h">Hidden</a></div><a href="#b" id="after">After</a>`,
    );
    initFloats();
    const close = document.querySelector<HTMLButtonElement>("[data-emvb-float-dismiss]");
    close?.focus();
    close?.click();
    expect(document.activeElement?.id).toBe("after");
  });

  test("W-782 with nothing after the float, focus goes to the control before it", () => {
    mount(true);
    document.body.insertAdjacentHTML("afterbegin", `<a href="#a" id="before">Before</a>`);
    initFloats();
    const close = document.querySelector<HTMLButtonElement>("[data-emvb-float-dismiss]");
    close?.focus();
    close?.click();
    expect(document.activeElement?.id).toBe("before");
  });
});
