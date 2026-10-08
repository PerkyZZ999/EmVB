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
  test("focus moving outside the dropdown's menu item closes it (W-254)", () => {
    const details = fixture();
    (document.getElementById("sub") as HTMLElement).focus();
    expect(details.open).toBe(true);
    (document.getElementById("outside") as HTMLElement).focus();
    expect(details.open).toBe(false);
  });
  test("a press outside the menu item closes it; a press inside keeps it open (W-254)", () => {
    const details = fixture();
    const press = (id: string) =>
      (document.getElementById(id) as HTMLElement).dispatchEvent(
        new Event("pointerdown", { bubbles: true }),
      );
    press("sub");
    expect(details.open).toBe(true);
    press("outside");
    expect(details.open).toBe(false);
  });
  test("focus on the next top-level item closes the previous dropdown (W-254)", () => {
    fixture();
    const nav = document.querySelector(".emvb-menu__list") as HTMLElement;
    nav.insertAdjacentHTML(
      "beforeend",
      '<li class="emvb-menu-item"><div class="emvb-menu-item__bar"><a href="/b" id="next">B</a></div></li>',
    );
    const details = document.querySelector("details") as HTMLDetailsElement;
    (document.getElementById("next") as HTMLElement).focus();
    expect(details.open).toBe(false);
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
