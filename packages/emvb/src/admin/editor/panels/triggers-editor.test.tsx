import { afterEach, describe, expect, test } from "bun:test";
import { comboboxName } from "../../../../test/dom/combobox.ts";
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
      comboboxName,
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

  test("W-280: Add trigger stops at the most a popup can save, and says why", async () => {
    const addButton = () =>
      [...document.querySelectorAll<HTMLButtonElement>("button")].find(
        (b) => b.textContent === "Add trigger",
      );
    const delays = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ type: "delay" as const, ms: 1000 * (i + 1) }));
    await show(doc(delays(7)));
    expect(addButton()?.disabled).toBe(false);
    expect(document.querySelector("[data-emvb-triggers-full]")).toBeNull();
    await act(async () => addButton()?.click());
    expect(sent.at(-1)?.open.length).toBe(8);
    await show(doc(delays(8)));
    expect(addButton()?.disabled).toBe(true);
    expect(document.querySelector("[data-emvb-triggers-full]")?.textContent).toBe(
      "8 triggers is the most one popup can have. Remove one to add another.",
    );
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
    expect(text).toContain(
      "Limit how often the popup shows, on which devices, on which addresses and when.",
    );
    expect(text).toContain("All devices when none are checked.");
    expect(text).not.toContain("MVP");
    expect(text).not.toContain("localStorage");
  });
});

describe("popup address rules and show dates (W-1081)", () => {
  const type = async (
    el: HTMLInputElement | HTMLTextAreaElement | null | undefined,
    value: string,
  ) => {
    expect(Boolean(el)).toBe(true);
    await act(async () => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set?.call(el, value);
      el?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      el?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      el?.dispatchEvent(new FocusEvent("blur"));
    });
  };
  const rules = () => document.querySelector<HTMLTextAreaElement>("[data-emvb-url-rules] textarea");
  const dateField = (label: string) => {
    const el = [...document.querySelectorAll("label")].find((l) => l.textContent?.trim() === label);
    const id = el?.getAttribute("for");
    return id ? document.querySelector<HTMLInputElement>(`[id="${id}"]`) : null;
  };

  test("rules typed one per line are saved; a line that isn't a rule says why and saves nothing", async () => {
    await show(doc([{ type: "page_load" }]));
    await type(rules(), "utm_source=news\n!preview");
    expect(sent.at(-1)?.advanced).toEqual({
      urlParams: [
        { name: "utm_source", value: "news" },
        { name: "preview", absent: true },
      ],
    });
    const before = sent.length;
    await type(rules(), "not a rule");
    expect(sent.length).toBe(before);
    expect(document.querySelector("[data-emvb-url-rules] [role='alert']")?.textContent).toContain(
      "isn't a rule",
    );
  });

  test("a start date with its offset is saved; a day that doesn't exist isn't", async () => {
    await show(doc([{ type: "page_load" }]));
    await type(dateField("Show from"), "2026-12-01T09:00-05:00");
    expect(sent.at(-1)?.advanced).toEqual({ from: "2026-12-01T09:00-05:00" });
    const before = sent.length;
    await type(dateField("Show until"), "2026-02-30T09:00Z");
    expect(sent.length).toBe(before);
  });

  test("an end at or before the start says so on the field and isn't saved", async () => {
    await show(doc([{ type: "page_load" }], { from: "2026-12-01T09:00Z" }));
    await type(dateField("Show until"), "2026-11-30T09:00Z");
    expect(sent.length).toBe(0);
    const until = dateField("Show until");
    expect(document.body.textContent).toContain("The end must come after the start.");
    expect(until?.getAttribute("aria-invalid")).toBe("true");
    await type(dateField("Show until"), "2026-12-02T09:00Z");
    expect(sent.at(-1)?.advanced).toEqual({
      from: "2026-12-01T09:00Z",
      until: "2026-12-02T09:00Z",
    });
    await show(doc([{ type: "page_load" }], { until: "2026-12-01T09:00Z" }));
    await type(dateField("Show from"), "2026-12-01T09:00Z");
    expect(sent.length).toBe(1);
  });
});

describe("popup or off-canvas panel (W-1071)", () => {
  test("other settings keep the panel; Popup in the middle drops it", async () => {
    await show(doc([{ type: "click", selector: ".open-menu" }], {}));
    // A panel set elsewhere (the stored doc) survives a device change in this editor.
    await show({ ...doc([{ type: "click", selector: ".open-menu" }]), panel: { edge: "right" } });
    const mobile = [...document.querySelectorAll<HTMLInputElement>("input[type=checkbox]")].find(
      (el) => el.parentElement?.textContent?.includes("Mobile"),
    );
    await act(async () => mobile?.click());
    expect(sent.at(-1)?.panel).toEqual({ edge: "right" });
    expect(sent.at(-1)?.advanced).toEqual({ devices: ["mobile"] });
    expect(document.body.textContent).toContain("Panel width");
  });
});
