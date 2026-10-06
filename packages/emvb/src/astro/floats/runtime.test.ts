import { afterEach, describe, expect, test } from "bun:test";
import { initFloats } from "./runtime.ts";

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.style.cssText = "";
  sessionStorage.clear();
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
