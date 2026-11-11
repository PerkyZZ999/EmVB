import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { emptyDesign, type FlatStyleProps } from "../../../../core/index.ts";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { StyleRow } from "./StyleRow.tsx";
import type { StyleKey } from "./style-sections.ts";

afterEach(cleanup);

let patches: Partial<FlatStyleProps>[] = [];
afterEach(() => {
  patches = [];
});

const row = (styleKey: StyleKey, inherited: FlatStyleProps, style: FlatStyleProps = {}) =>
  mount(
    <StyleRow
      styleKey={styleKey}
      style={style}
      inherited={inherited}
      design={emptyDesign()}
      onPatch={(patch) => patches.push(patch)}
      onDesignChange={async () => undefined}
    />,
  );

const note = () => document.querySelector("[data-emvb-inherited-note]")?.textContent ?? "";
const button = (name: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent === name);

const shadow = { x: 2, y: 8, blur: 24, spread: 0, color: "#112233" };
const cases: [StyleKey, FlatStyleProps, string][] = [
  ["boxShadow", { boxShadow: shadow }, "2 8 24 0 px, #112233"],
  ["iconShadow", { iconShadow: { x: 1, y: 2, blur: 3, color: "#000000" } }, "1 2 3 px, #000000"],
  ["entrance", { entrance: { type: "fade-up", duration: 600 } }, "Fade up, 600 ms"],
  ["transition", { transition: { duration: 300, easing: "ease-out", property: "all" } }, "300 ms"],
];

for (const [key, inherited, summary] of cases) {
  test(`W-969: an inherited ${key} is shown, and Edit here starts from it`, async () => {
    await row(key, inherited);
    expect(note()).toContain(summary);
    expect(
      document.querySelector(`[data-emvb-style="${key}"]`)?.getAttribute("data-inherited"),
    ).toBe("true");
    const edit = button("Edit here");
    expect(edit).toBeDefined();
    await act(async () => edit?.click());
    expect(patches).toEqual([{ [key]: inherited[key as keyof FlatStyleProps] }]);
  });
}

test("W-969: with nothing inherited, Add starts from the default as before", async () => {
  await row("boxShadow", {});
  expect(note()).toBe("");
  expect(button("Add shadow")).toBeDefined();
});

test("W-969: a value set here hides the inherited note", async () => {
  await row("boxShadow", { boxShadow: shadow }, { boxShadow: { ...shadow, x: 9 } });
  expect(note()).toBe("");
});
