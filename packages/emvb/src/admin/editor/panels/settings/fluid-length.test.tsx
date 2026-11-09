import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { emptyDesign, type FlatStyleProps } from "../../../../core/index.ts";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { sideDraft } from "./box-sides.ts";
import { parseLengthDraft } from "./length-units.ts";
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

test("W-955: a range typed in a length field becomes a fluid size", async () => {
  await row("fontSize");
  await type("32–56");
  expect(patches).toEqual([{ fontSize: { fluid: { min: 32, max: 56 } } }]);
});

test("W-955: a fluid size shows as its range in px", async () => {
  await row("fontSize", { fontSize: { fluid: { min: 32, max: 56 } } });
  expect(input()?.value).toBe("32–56");
  expect(document.querySelector(".emvb-unit-btn")?.textContent).toBe("px");
  expect(input()?.title).toContain("A range such as 32–56 grows from phones to large screens");
});

test("W-955: ranges parse in the usual spellings, only where a fluid size is allowed", () => {
  for (const text of ["32-56", "32 – 56", "32px-56px", "32 to 56", "1.5–2.25"]) {
    expect(parseLengthDraft(text, "paddingTop", "px")).toMatchObject({
      ok: true,
      value: { fluid: {} },
    });
  }
  expect(parseLengthDraft("32-56", "lineHeight", "em")).toEqual({
    ok: false,
    message: "Line height takes one number, not a range.",
  });
  expect(parseLengthDraft("10-20000", "width", "px")).toMatchObject({ ok: false });
  // A negative margin is still one number.
  expect(parseLengthDraft("-8", "marginTop", "px")).toEqual({
    ok: true,
    value: { value: -8, unit: "px" },
  });
});

test("W-955: padding and margin boxes show a fluid side as its range", () => {
  expect(sideDraft({ fluid: { min: 8, max: 24 } }, "px")).toBe("8–24");
});
