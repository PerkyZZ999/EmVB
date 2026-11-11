import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { emptyDesign, type FlatStyleProps } from "../../../../core/index.ts";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { unitsFor } from "./length-units.ts";
import { StyleRow } from "./StyleRow.tsx";
import type { StyleKey } from "./style-sections.ts";

afterEach(cleanup);

let patches: Partial<FlatStyleProps>[] = [];
afterEach(() => {
  patches = [];
});

const row = (styleKey: StyleKey, style: FlatStyleProps = {}) =>
  mount(
    <StyleRow
      styleKey={styleKey}
      style={style}
      design={emptyDesign()}
      onPatch={(patch) => patches.push(patch)}
      onDesignChange={async () => undefined}
    />,
  );

const input = () => document.querySelector<HTMLInputElement>(".emvb-length input");

async function type(text: string) {
  const field = input();
  await act(async () => {
    field?.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, text);
    field?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => field?.blur());
}

test("heights offer dvh and svh; padding and font size don't (W-974)", () => {
  for (const key of ["height", "minHeight", "maxHeight"] as const) {
    expect(unitsFor(key)).toContain("dvh");
    expect(unitsFor(key)).toContain("svh");
  }
  expect(unitsFor("paddingTop")).not.toContain("dvh");
  expect(unitsFor("fontSize")).not.toContain("svh");
});

test("100dvh is stored as 100vh plus the record's mark", async () => {
  await row("minHeight");
  await type("100dvh");
  expect(patches).toEqual([
    { minHeight: { value: 100, unit: "vh" }, viewportUnits: { minHeight: "dvh" } },
  ]);
});

test("a marked vh length shows its dvh unit; another unit drops the mark", async () => {
  await row("minHeight", {
    minHeight: { value: 100, unit: "vh" },
    viewportUnits: { minHeight: "svh", height: "dvh" },
  });
  expect(input()?.value).toBe("100");
  expect(document.querySelector(".emvb-unit-btn")?.textContent).toBe("svh");
  await type("600px");
  expect(patches).toEqual([
    { minHeight: { value: 600, unit: "px" }, viewportUnits: { height: "dvh" } },
  ]);
});

test("plain vh stays plain, with no mark written", async () => {
  await row("height");
  await type("50vh");
  expect(patches).toEqual([{ height: { value: 50, unit: "vh" } }]);
});
