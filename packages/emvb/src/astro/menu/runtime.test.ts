import { describe, expect, test } from "bun:test";
import { layoutHasMenuDropdown, type Layout } from "../../core/index.ts";
import { initMenus } from "./runtime.ts";

const fixture = () => {
  document.body.innerHTML = `
    <nav class="emvb-menu"><ul class="emvb-menu__list"><li class="emvb-menu-item">
      <div class="emvb-menu-item__bar"><span>Work</span>
        <details class="emvb-menu-item__disclosure" open>
          <summary class="emvb-menu-item__toggle" aria-label="Open Work"></summary>
          <div class="emvb-menu-panel"><a href="/a" id="sub">Sub A</a></div>
        </details></div></li></ul></nav><button id="outside">x</button>`;
  return document.querySelector("details") as HTMLDetailsElement;
};
const esc = () =>
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
  );

describe("menu runtime (W-197)", () => {
  initMenus();
  test("Escape inside a dropdown closes it and returns focus to its toggle", () => {
    const details = fixture();
    (document.getElementById("sub") as HTMLElement).focus();
    esc();
    expect(details.open).toBe(false);
    expect(document.activeElement?.tagName).toBe("SUMMARY");
  });
  test("Escape with an open dropdown elsewhere (hover/pointer) still closes it", () => {
    const details = fixture();
    (document.getElementById("outside") as HTMLElement).focus();
    esc();
    expect(details.open).toBe(false);
  });
  test("other keys leave the dropdown open", () => {
    const details = fixture();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(details.open).toBe(true);
  });
  test("only layouts with a Menu dropdown ask for the script", () => {
    const item = (children: unknown[]) => ({
      id: "item0001",
      type: "menu-item",
      props: { text: "A" },
      children,
    });
    const page = (children: unknown[]) =>
      ({
        schemaVersion: 12,
        root: {
          id: "root0001",
          type: "container",
          props: {},
          children: [{ id: "menu0001", type: "menu", props: {}, children }],
        },
      }) as unknown as Layout;
    expect(layoutHasMenuDropdown(page([item([])]))).toBe(false);
    expect(
      layoutHasMenuDropdown(
        page([item([{ id: "sub00001", type: "menu-item", props: { text: "B" }, children: [] }])]),
      ),
    ).toBe(true);
  });
});
