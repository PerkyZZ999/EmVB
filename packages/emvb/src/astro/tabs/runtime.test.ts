import { describe, expect, test } from "bun:test";
import { initTabs, selectTabForTest } from "./runtime.ts";

function fixture(): HTMLElement {
  document.body.innerHTML = `
    <div class="emvb-tabs" id="tabs-demo">
      <input class="emvb-tab-input" type="radio" name="g" id="g-0" checked />
      <input class="emvb-tab-input" type="radio" name="g" id="g-1" />
      <div class="emvb-tab-list" role="tablist">
        <label class="emvb-tab-label" role="tab" for="g-0">One</label>
        <label class="emvb-tab-label" role="tab" for="g-1">Two</label>
      </div>
      <div class="emvb-tab-panels">
        <div class="emvb-tab-panel" role="tabpanel">A</div>
        <div class="emvb-tab-panel" role="tabpanel">B</div>
      </div>
    </div>
  `;
  return document.body.querySelector(".emvb-tabs") as HTMLElement;
}

describe("tabs runtime (W-078)", () => {
  test("init sets aria-selected and arrow keys move selection", () => {
    const root = fixture();
    initTabs(document);
    const labels = [...root.querySelectorAll<HTMLElement>(".emvb-tab-label")];
    expect(labels[0]?.getAttribute("aria-selected")).toBe("true");
    expect(labels[1]?.getAttribute("aria-selected")).toBe("false");
    expect(labels[0]?.tabIndex).toBe(0);
    expect(labels[1]?.tabIndex).toBe(-1);

    const list = root.querySelector(".emvb-tab-list") as HTMLElement;
    list.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }),
    );
    expect(labels[1]?.getAttribute("aria-selected")).toBe("true");
    expect((root.querySelectorAll(".emvb-tab-input")[1] as HTMLInputElement).checked).toBe(true);

    selectTabForTest(root, 0);
    expect(labels[0]?.getAttribute("aria-selected")).toBe("true");
    list.dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }),
    );
    expect(labels[1]?.getAttribute("aria-selected")).toBe("true");
    list.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }),
    );
    expect(labels[0]?.getAttribute("aria-selected")).toBe("true");
  });
});
