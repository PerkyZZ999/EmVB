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

  /** Three tabs, the second one checked; the first panel and label carry their own ids. */
  function threeTabs(rootId: string) {
    document.body.innerHTML = `
      <div class="emvb-tabs"${rootId ? ` id="${rootId}"` : ""}>
        <input class="emvb-tab-input" type="radio" name="t" />
        <input class="emvb-tab-input" type="radio" name="t" checked />
        <input class="emvb-tab-input" type="radio" name="t" />
        <div class="emvb-tab-list" role="tablist">
          <label class="emvb-tab-label" role="tab" id="own-tab">One</label>
          <label class="emvb-tab-label" role="tab">Two</label>
          <label class="emvb-tab-label" role="tab">Three</label>
        </div>
        <div class="emvb-tab-panels">
          <div class="emvb-tab-panel" role="tabpanel" id="own-panel">A</div>
          <div class="emvb-tab-panel" role="tabpanel">B</div>
          <div class="emvb-tab-panel" role="tabpanel">C
            <div class="emvb-tabs" id="inner">
              <input class="emvb-tab-input" type="radio" name="i" checked />
              <div class="emvb-tab-list"><label class="emvb-tab-label">Inner</label></div>
              <div class="emvb-tab-panels"><div class="emvb-tab-panel">I</div></div>
            </div>
          </div>
        </div>
      </div>
    `;
    return document.body.querySelector(".emvb-tabs") as HTMLElement;
  }

  /** Each tab of `root` as "checked selected tabindex hidden [focused]". */
  function state(root: HTMLElement) {
    const inputs = root.querySelectorAll<HTMLInputElement>(":scope > .emvb-tab-input");
    const labels = root.querySelectorAll<HTMLElement>(":scope > .emvb-tab-list > .emvb-tab-label");
    const panels = root.querySelectorAll<HTMLElement>(
      ":scope > .emvb-tab-panels > .emvb-tab-panel",
    );
    return [...labels].map((label, i) =>
      [
        inputs[i]?.checked ? "checked" : "-",
        label.getAttribute("aria-selected"),
        label.tabIndex,
        panels[i]?.getAttribute("aria-hidden"),
        document.activeElement === label ? "focused" : "",
      ]
        .join(" ")
        .trim(),
    );
  }

  const press = (root: HTMLElement, key: string) => {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    root.querySelector(":scope > .emvb-tab-list")?.dispatchEvent(event);
    return event.defaultPrevented;
  };

  test("init links tabs to panels, keeping existing ids, and starts on the checked tab", () => {
    const root = threeTabs("tabs-x");
    initTabs(document);
    initTabs(document);
    const labels = [
      ...root.querySelectorAll<HTMLElement>(":scope > .emvb-tab-list > .emvb-tab-label"),
    ];
    const panels = [
      ...root.querySelectorAll<HTMLElement>(":scope > .emvb-tab-panels > .emvb-tab-panel"),
    ];
    expect(root.querySelector(":scope > .emvb-tab-list")?.getAttribute("aria-orientation")).toBe(
      "horizontal",
    );
    expect(labels.map((l) => [l.id, l.getAttribute("aria-controls")])).toEqual([
      ["own-tab", "own-panel"],
      ["tabs-x-tab-1", "tabs-x-panel-1"],
      ["tabs-x-tab-2", "tabs-x-panel-2"],
    ]);
    expect(panels.map((p) => [p.id, p.getAttribute("aria-labelledby")])).toEqual([
      ["own-panel", "own-tab"],
      ["tabs-x-panel-1", "tabs-x-tab-1"],
      ["tabs-x-panel-2", "tabs-x-tab-2"],
    ]);
    expect(state(root)).toEqual(["- false -1 true", "checked true 0 false", "- false -1 true"]);
    const inner = document.getElementById("inner") as HTMLElement;
    expect(state(inner)).toEqual(["checked true 0 false"]);
  });

  test("loading the page leaves focus where it was (QA-2)", () => {
    threeTabs("tabs-f");
    const before = document.createElement("button");
    document.body.append(before);
    before.focus();
    initTabs(document);
    expect(document.activeElement?.outerHTML).toBe(before.outerHTML);
  });

  test("a root without an id names its tabs emvb-tabs-…", () => {
    const root = threeTabs("");
    initTabs(document);
    const second = root.querySelectorAll<HTMLElement>(
      ":scope > .emvb-tab-list > .emvb-tab-label",
    )[1];
    expect([second?.id, second?.getAttribute("aria-controls")]).toEqual([
      "emvb-tabs-tab-1",
      "emvb-tabs-panel-1",
    ]);
  });

  test("arrows wrap, Home and End jump, and other keys are left alone", () => {
    const root = threeTabs("tabs-k");
    initTabs(document);
    expect(press(root, "ArrowRight")).toBe(true);
    expect(state(root)).toEqual([
      "- false -1 true",
      "- false -1 true",
      "checked true 0 false focused",
    ]);
    press(root, "ArrowRight");
    expect(state(root)[0]).toBe("checked true 0 false focused");
    press(root, "ArrowLeft");
    expect(state(root)[2]).toBe("checked true 0 false focused");
    press(root, "Home");
    expect(state(root)[0]).toBe("checked true 0 false focused");
    press(root, "End");
    expect(state(root)[2]).toBe("checked true 0 false focused");
    expect(press(root, "ArrowDown")).toBe(false);
    expect(press(root, "Enter")).toBe(false);
    expect(state(root)[2]).toBe("checked true 0 false focused");
  });

  test("choosing a radio directly keeps ARIA in step", () => {
    const root = threeTabs("tabs-c");
    initTabs(document);
    const third = root.querySelectorAll<HTMLInputElement>(
      ":scope > .emvb-tab-input",
    )[2] as HTMLInputElement;
    third.checked = true;
    third.dispatchEvent(new Event("change", { bubbles: true }));
    expect(state(root)).toEqual(["- false -1 true", "- false -1 true", "checked true 0 false"]);
  });

  // W-091: survivors in the tabs runtime (Stryker 76%).
  test("initialising twice still moves one tab per key press", () => {
    const root = threeTabs("tabs-2");
    initTabs(document);
    initTabs(document);
    press(root, "ArrowRight");
    expect(state(root)).toEqual([
      "- false -1 true",
      "- false -1 true",
      "checked true 0 false focused",
    ]);
  });

  test("with no radio checked the first tab is selected", () => {
    const root = threeTabs("tabs-n");
    for (const input of root.querySelectorAll<HTMLInputElement>(".emvb-tab-input")) {
      input.checked = false;
    }
    initTabs(document);
    expect(state(root)).toEqual(["checked true 0 false", "- false -1 true", "- false -1 true"]);
  });

  test("keyboard focus moves without scrolling the page", () => {
    const root = threeTabs("tabs-s");
    initTabs(document);
    const labels = [
      ...root.querySelectorAll<HTMLElement>(":scope > .emvb-tab-list > .emvb-tab-label"),
    ];
    const calls: unknown[] = [];
    const third = labels[2] as HTMLElement;
    third.focus = (options?: FocusOptions) => {
      calls.push(options);
    };
    press(root, "ArrowRight");
    expect(calls).toEqual([{ preventScroll: true }]);
  });

  test("a tab without a panel still gets aria-controls, and nothing throws", () => {
    document.body.innerHTML = `
      <div class="emvb-tabs" id="tabs-p">
        <input class="emvb-tab-input" type="radio" name="p" checked />
        <input class="emvb-tab-input" type="radio" name="p" />
        <div class="emvb-tab-list">
          <label class="emvb-tab-label">One</label>
          <label class="emvb-tab-label">Two</label>
        </div>
        <div class="emvb-tab-panels"><div class="emvb-tab-panel">A</div></div>
      </div>`;
    const root = document.body.querySelector(".emvb-tabs") as HTMLElement;
    expect(() => initTabs(document)).not.toThrow();
    const labels = [...root.querySelectorAll<HTMLElement>(".emvb-tab-label")];
    expect(labels.map((l) => [l.id, l.getAttribute("aria-controls")])).toEqual([
      ["tabs-p-tab-0", "tabs-p-panel-0"],
      ["", "tabs-p-panel-1"],
    ]);
    expect(() => press(root, "ArrowRight")).not.toThrow();
    expect(state(root)).toEqual(["- false -1 true", "checked true 0  focused"]);
  });

  test("a group without a tab list is left alone", () => {
    document.body.innerHTML = `
      <div class="emvb-tabs">
        <input class="emvb-tab-input" type="radio" name="l" checked />
        <div class="emvb-tab-panels"><div class="emvb-tab-panel">A</div></div>
      </div>`;
    expect(() => initTabs(document)).not.toThrow();
    expect(document.body.querySelector(".emvb-tab-panel")?.hasAttribute("aria-hidden")).toBe(false);
  });

  test("after init the hidden radios are out of the Tab order (W-195)", () => {
    const root = fixture();
    initTabs(document);
    for (const input of root.querySelectorAll<HTMLInputElement>(".emvb-tab-input")) {
      expect(input.tabIndex).toBe(-1);
      expect(input.getAttribute("aria-hidden")).toBe("true");
    }
  });
});
