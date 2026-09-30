import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { PopupOpenTrigger } from "../../../core/index.ts";
import { cleanup, mount } from "../../../../test/dom/mount.ts";
import { TriggerSettings } from "./TriggerSettings.tsx";

afterEach(cleanup);

/**
 * Renders the settings row, types `value` into its number field and commits it (blur, or Enter
 * with `key`), and returns the field bounds, what was sent, and what the field shows after.
 */
async function enter(trigger: PopupOpenTrigger, value: string, key?: "Enter") {
  const sent: PopupOpenTrigger[] = [];
  const host = await mount(
    <TriggerSettings trigger={trigger} onChange={(next) => sent.push(next)} />,
  );
  const field = host.querySelector("input") as HTMLInputElement;
  await act(async () => {
    field.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const typed = sent.length;
  await act(async () => {
    if (key) field.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    else field.blur();
  });
  return { bounds: [field.min, field.max], sent, typed, shown: field.value };
}

describe("popup trigger settings (W-081)", () => {
  test("delay is bounded 0–120 000 ms and never negative", async () => {
    const low = await enter({ type: "delay", ms: 3000 }, "-5");
    expect(low.bounds).toEqual(["0", "120000"]);
    expect(low.sent).toEqual([{ type: "delay", ms: 0 }]);
    expect((await enter({ type: "delay", ms: 3000 }, "")).sent).toEqual([{ type: "delay", ms: 0 }]);
    expect((await enter({ type: "delay", ms: 3000 }, "4500")).sent).toEqual([
      { type: "delay", ms: 4500 },
    ]);
  });

  test("scroll percent is clamped to 0–100", async () => {
    const high = await enter({ type: "scroll", percent: 50 }, "150");
    expect(high.bounds).toEqual(["0", "100"]);
    expect(high.sent).toEqual([{ type: "scroll", percent: 100 }]);
    expect((await enter({ type: "scroll", percent: 50 }, "-3")).sent).toEqual([
      { type: "scroll", percent: 0 },
    ]);
    expect((await enter({ type: "scroll", percent: 50 }, "")).sent).toEqual([
      { type: "scroll", percent: 0 },
    ]);
  });

  test("delay is capped at 120 000 ms", async () => {
    expect((await enter({ type: "delay", ms: 3000 }, "150000")).sent).toEqual([
      { type: "delay", ms: 120_000 },
    ]);
  });

  test("typing sends nothing until blur or Enter, then shows the committed value", async () => {
    const idle = await enter({ type: "inactivity", ms: 30_000 }, "5", "Enter");
    expect(idle.typed).toBe(0);
    expect(idle.sent).toEqual([{ type: "inactivity", ms: 1000 }]);
    expect(idle.shown).toBe("1000");
    const same = await enter({ type: "delay", ms: 3000 }, "3000");
    expect(same.sent).toEqual([]);
  });

  test("each number field explains its unit in words", async () => {
    const texts: string[] = [];
    for (const trigger of [
      { type: "delay", ms: 4500 },
      { type: "scroll", percent: 50 },
      { type: "inactivity", ms: 30_000 },
    ] as PopupOpenTrigger[]) {
      // oxlint-disable-next-line no-await-in-loop -- one mounted row at a time
      const host = await mount(<TriggerSettings trigger={trigger} onChange={() => undefined} />);
      texts.push(host.textContent ?? "");
    }
    expect(texts[0]).toContain("4.5 s after the page loads.");
    expect(texts[1]).toContain("How far down the page, from 0 to 100.");
    expect(texts[2]).toContain("30 s without scrolling, typing, clicking or moving the pointer.");
  });

  test("idle time is at least 1 000 ms, and an empty field means 1 000", async () => {
    const low = await enter({ type: "inactivity", ms: 30_000 }, "10");
    expect(low.bounds).toEqual(["1000", "120000"]);
    expect(low.sent).toEqual([{ type: "inactivity", ms: 1000 }]);
    expect((await enter({ type: "inactivity", ms: 30_000 }, "")).sent).toEqual([
      { type: "inactivity", ms: 1000 },
    ]);
    expect((await enter({ type: "inactivity", ms: 30_000 }, "5000")).sent).toEqual([
      { type: "inactivity", ms: 5000 },
    ]);
  });
});
