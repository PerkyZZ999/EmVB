import { afterEach, expect, test } from "bun:test";
import { emvbDialogOf, tabbablesIn, wrapTab } from "./dialog-tab-wrap.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

/** A dialog like Kumo's: guards around a popup holding EmVB content. */
function dialog() {
  document.body.innerHTML = `
    <button id="behind">Behind</button>
    <div data-base-ui-portal>
      <span data-base-ui-focus-guard tabindex="0"></span>
      <div role="dialog" id="d"><div class="emvb-dialog">
        <button id="first">First</button>
        <button disabled>Off</button>
        <input type="hidden">
        <input id="middle">
        <button id="last">Last</button>
      </div></div>
      <span data-base-ui-focus-guard tabindex="0"></span>
    </div>`;
  const root = document.getElementById("d") as HTMLElement;
  // happy-dom has no layout: every element counts as shown.
  for (const el of root.querySelectorAll<HTMLElement>("*"))
    el.getClientRects = () => [{}] as unknown as DOMRectList;
  return root;
}
const tab = (shiftKey = false) =>
  new KeyboardEvent("keydown", { key: "Tab", shiftKey, cancelable: true });

test("W-984: the controls Tab can reach, without guards, disabled or hidden ones", () => {
  expect(tabbablesIn(dialog()).map((el) => el.id)).toEqual(["first", "middle", "last"]);
});

test("W-984: Tab on the last control goes to the first; Shift+Tab on the first to the last", () => {
  const root = dialog();
  (document.getElementById("last") as HTMLElement).focus();
  const forward = tab();
  expect(wrapTab(forward, root)).toBe(true);
  expect(forward.defaultPrevented).toBe(true);
  expect(document.activeElement?.id).toBe("first");
  const back = tab(true);
  expect(wrapTab(back, root)).toBe(true);
  expect(document.activeElement?.id).toBe("last");
  // In the middle, the browser moves focus as usual.
  (document.getElementById("middle") as HTMLElement).focus();
  const plain = tab();
  expect(wrapTab(plain, root)).toBe(false);
  expect(plain.defaultPrevented).toBe(false);
});

test("W-984: only EmVB dialogs are wrapped", () => {
  dialog();
  expect(emvbDialogOf(document.getElementById("middle"))?.id).toBe("d");
  expect(emvbDialogOf(document.getElementById("behind"))).toBeNull();
  document.body.innerHTML = `<div role="dialog"><button id="host">EmDash</button></div>`;
  expect(emvbDialogOf(document.getElementById("host"))).toBeNull();
});
