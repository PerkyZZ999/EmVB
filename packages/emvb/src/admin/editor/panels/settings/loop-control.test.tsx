import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { FlatStyleProps } from "../../../../core/index.ts";
import { cleanup, mount, rerender } from "../../../../../test/dom/mount.ts";
import { LOOP_PRESETS, LoopControl } from "./LoopControl.tsx";

afterEach(cleanup);
type Loop = FlatStyleProps["loopMotion"];
const [first, second] = LOOP_PRESETS;
if (!first || !second) throw new Error("presets missing");

const button = (root: HTMLElement, text: string) =>
  [...root.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
const toggle = (root: HTMLElement, data: string) =>
  root.querySelector<HTMLElement>(
    `[${data}] [role="switch"], [${data}][role="switch"], [${data}] input`,
  );

describe("W-939 loop control", () => {
  test("Add loop starts at Float; Loop forever and Back and forth store their keys", async () => {
    let value: Loop;
    const view = () => (
      <LoopControl value={value} onChange={(next) => (value = next)} reset={null} />
    );
    const root = await mount(view());
    await act(async () => button(root, "Add loop")?.click());
    expect(value).toEqual(first.value);
    await rerender(view());
    expect(root.querySelectorAll("[data-emvb-loop]").length).toBe(1);
    await act(async () => toggle(root, "data-emvb-loop-forever")?.click());
    expect(value).toEqual({ ...first.value, loop: true });
    await rerender(view());
    await act(async () => toggle(root, "data-emvb-loop-alternate")?.click());
    expect(value).toEqual({ ...first.value, loop: true, alternate: false });
  });

  test("Turn off loop sets none, shown as off; removing the last effect clears it", async () => {
    let value: Loop = structuredClone(second.value);
    const view = () => (
      <LoopControl value={value} onChange={(next) => (value = next)} reset={null} />
    );
    const root = await mount(view());
    await act(async () =>
      root.querySelector<HTMLButtonElement>('[aria-label="Remove Scale"]')?.click(),
    );
    expect(value).toBeUndefined();
    value = structuredClone(second.value);
    await rerender(view());
    await act(async () => button(root, "Turn off loop")?.click());
    expect(value as Loop).toEqual({ type: "none" });
    await rerender(view());
    expect(root.querySelector("[data-emvb-loop-off]")).not.toBeNull();
  });

  test("every preset is a valid loop value", async () => {
    const { loopDeclarations } = await import("../../../../core/sanitize/motion.ts");
    for (const preset of LOOP_PRESETS) expect(loopDeclarations(preset.value)).toBeDefined();
  });
});
