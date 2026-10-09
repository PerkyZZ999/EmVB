import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { StyleProps } from "../../../../core/index.ts";
import { cleanup, mount, rerender } from "../../../../../test/dom/mount.ts";
import { MOTION_PRESETS, MotionControl, presetOf } from "./MotionControl.tsx";

afterEach(cleanup);
type Motion = StyleProps["scrollMotion"];

describe("W-319 scroll motion control", () => {
  test("W-319 Add scroll motion starts at Rise in, then effects can be removed", async () => {
    let value: Motion;
    const view = () => (
      <MotionControl value={value} onChange={(next) => (value = next)} reset={null} />
    );
    const root = await mount(view());
    const add = [...root.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Add scroll motion"),
    );
    await act(async () => add?.click());
    expect(value).toEqual(MOTION_PRESETS[1]?.value);
    await rerender(view());
    expect(root.querySelectorAll("[data-emvb-motion]").length).toBe(2);
    const remove = root.querySelector('[aria-label="Remove Opacity"]') as HTMLButtonElement;
    await act(async () => remove.click());
    expect(value).toEqual({ range: "enter", effects: [{ type: "move-y", from: 60, to: 0 }] });
    await rerender(view());
    const last = root.querySelector('[aria-label="Remove Move up/down"]') as HTMLButtonElement;
    await act(async () => last.click());
    expect(value).toBeUndefined();
  });

  test("W-319 Turn off here sets none, shown as off", async () => {
    let value: Motion = structuredClone(MOTION_PRESETS[0]?.value);
    const root = await mount(
      <MotionControl value={value} onChange={(next) => (value = next)} reset={null} />,
    );
    const off = [...root.querySelectorAll("button")].find((b) => b.textContent === "Turn off here");
    await act(async () => off?.click());
    expect(value as Motion).toEqual({ type: "none" });
    await rerender(<MotionControl value={value} onChange={() => {}} reset={null} />);
    expect(root.querySelector("[data-emvb-motion-off]")).not.toBeNull();
  });

  test("W-319 presets are recognised and edited ones are custom", () => {
    const preset = MOTION_PRESETS[4];
    if (!preset) throw new Error("missing preset");
    expect(presetOf(structuredClone(preset.value))).toBe(preset.id);
    expect(presetOf({ ...preset.value, range: "page" })).toBe("custom");
  });
});
