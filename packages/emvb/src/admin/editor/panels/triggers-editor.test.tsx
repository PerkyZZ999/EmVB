import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { TriggersDoc } from "../../../core/index.ts";
import { cleanup, mount } from "../../../../test/dom/mount.ts";
import { TriggersEditor } from "./TriggersEditor.tsx";

afterEach(cleanup);

let sent: TriggersDoc[] = [];
afterEach(() => {
  sent = [];
});

const doc = (open: TriggersDoc["open"], advanced: TriggersDoc["advanced"] = {}): TriggersDoc => ({
  schemaVersion: 1,
  open,
  advanced,
});

const show = (triggers: TriggersDoc) =>
  mount(<TriggersEditor triggers={triggers} onChange={(next) => sent.push(next)} />);

const removeButtons = () => [
  ...document.querySelectorAll<HTMLButtonElement>('button[aria-label="Remove trigger"]'),
];

describe("popup triggers editor (W-087)", () => {
  test("every trigger's type is labelled: Open when, then Or when", async () => {
    await show(doc([{ type: "page_load" }, { type: "delay", ms: 3000 }, { type: "exit_intent" }]));
    const names = [...document.querySelectorAll(".emvb-trigger-head [role='combobox']")].map(
      (select) => select.getAttribute("aria-label"),
    );
    expect(names).toEqual(["Open when", "Or when", "Or when"]);
  });

  test("the only On page load trigger can't be removed; others can", async () => {
    await show(doc([{ type: "page_load" }]));
    expect(removeButtons().map((b) => b.disabled)).toEqual([true]);
    await show(doc([{ type: "delay", ms: 3000 }]));
    expect(removeButtons().map((b) => b.disabled)).toEqual([false]);
    await act(async () => removeButtons()[0]?.click());
    expect(sent.map((d) => d.open)).toEqual([[{ type: "page_load" }]]);
  });

  test("Show at most commits on blur: empty is no limit, and it stays within 1 to 100", async () => {
    await show(doc([{ type: "page_load" }], { showTimes: 3 }));
    const field = [...document.querySelectorAll("input")].find(
      (input) => input.getAttribute("max") === "100",
    ) as HTMLInputElement;
    const commit = async (value: string) => {
      await act(async () => {
        field.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
          field,
          value,
        );
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => field.blur());
    };
    await commit("250");
    await commit("");
    await commit("0");
    expect(sent.length).toBe(3);
    expect(sent.map((d) => d.advanced?.showTimes)).toEqual([100, null, 1]);
  });

  test("the copy speaks to people, not to the roadmap", async () => {
    await show(doc([{ type: "page_load" }]));
    const text = document.body.textContent ?? "";
    expect(text).toContain("Limit how often the popup shows, and on which devices.");
    expect(text).toContain("All devices when none are checked.");
    expect(text).not.toContain("MVP");
    expect(text).not.toContain("localStorage");
  });
});
