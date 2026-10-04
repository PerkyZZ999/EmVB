import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { emptyDesign, type StyleProps } from "../../../../core/index.ts";
import { cleanup, mount, settle } from "../../../../../test/dom/mount.ts";
import { parseLengthDraft, unitsFor } from "./length-units.ts";
import { StyleRow } from "./StyleRow.tsx";
import type { StyleKey } from "./style-sections.ts";

afterEach(cleanup);

let patches: Partial<StyleProps>[] = [];
afterEach(() => {
  patches = [];
});

const row = (styleKey: StyleKey, style: StyleProps = {}) =>
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
const unitButton = () => document.querySelector<HTMLButtonElement>(".emvb-unit-btn");
const unitOptions = () =>
  [...document.querySelectorAll('[role="menuitemradio"]')].map((el) => el.textContent);

async function type(text: string, finish: "blur" | "enter" = "blur") {
  const field = input();
  await act(async () => {
    field?.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(field, text);
    field?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    if (finish === "enter") {
      field?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    } else {
      field?.blur();
    }
  });
}

async function pickUnit(unit: string) {
  await act(async () => unitButton()?.click());
  await settle();
  const option = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(
    (el) => el.textContent === unit,
  );
  await act(async () => option?.click());
  await settle();
}

describe("length field unit selector (W-088)", () => {
  test("each property offers its own units, and only sizes and margins offer auto", async () => {
    expect(unitsFor("width")).toEqual(["px", "%", "rem", "em", "vw", "vh", "auto"]);
    expect(unitsFor("marginLeft")).toContain("auto");
    expect(unitsFor("minWidth")).toEqual(["px", "%", "rem", "em", "vw", "vh"]);
    expect(unitsFor("paddingTop")).not.toContain("auto");
    expect(unitsFor("letterSpacing")).toEqual(["px", "rem", "em"]);
    expect(unitsFor("fontSize")).toEqual(["px", "rem", "em", "%", "vw"]);
    await row("letterSpacing");
    expect(unitButton()?.getAttribute("aria-label")).toBe("Letter spacing unit (px)");
    await act(async () => unitButton()?.click());
    await settle();
    expect(unitOptions()).toEqual(["px", "rem", "em"]);
  });

  test("the label has no unit suffix; the unit shows in the button", async () => {
    await row("width", { width: { value: 50, unit: "%" } });
    expect(document.querySelector(".emvb-style-row label")?.textContent).toBe("Width");
    expect(input()?.value).toBe("50");
    expect(unitButton()?.textContent).toBe("%");
  });

  test("typing a number with a unit saves that unit", async () => {
    await row("width");
    await type("1.5rem");
    await type("80VW", "enter");
    expect(patches).toEqual([
      { width: { value: 1.5, unit: "rem" } },
      { width: { value: 80, unit: "vw" } },
    ]);
  });

  test("a number without a unit uses the field's current unit", async () => {
    await row("maxWidth", { maxWidth: { value: 60, unit: "rem" } });
    await type("72");
    expect(patches).toEqual([{ maxWidth: { value: 72, unit: "rem" } }]);
  });

  test("picking a unit re-saves the same number in it, converting nothing", async () => {
    await row("width", { width: { value: 16, unit: "px" } });
    await pickUnit("rem");
    expect(patches).toEqual([{ width: { value: 16, unit: "rem" } }]);
    expect(unitButton()?.textContent).toBe("rem");
  });

  test("picking a unit on an empty field saves nothing but keeps the unit for typing", async () => {
    await row("height");
    await pickUnit("vh");
    expect(patches).toEqual([]);
    await type("100");
    expect(patches).toEqual([{ height: { value: 100, unit: "vh" } }]);
  });

  test("auto saves auto; typing a number afterwards returns to the last numeric unit", async () => {
    await row("marginLeft", { marginLeft: { value: 4, unit: "em" } });
    await pickUnit("auto");
    expect(patches).toEqual([{ marginLeft: "auto" }]);
    await row("marginLeft", { marginLeft: "auto" });
    expect(input()?.value).toBe("");
    expect(input()?.placeholder).toBe("auto");
    expect(unitButton()?.textContent).toBe("auto");
    await act(async () => {
      const field = input();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, "1");
      field?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(unitButton()?.textContent).toBe("px");
    await type("12");
    expect(patches).toEqual([{ marginLeft: "auto" }, { marginLeft: { value: 12, unit: "px" } }]);
  });

  test("typing auto works where it is allowed and is refused elsewhere", async () => {
    await row("width");
    await type("auto");
    expect(patches).toEqual([{ width: "auto" }]);
    await row("minWidth");
    await type("auto");
    expect(patches).toEqual([{ width: "auto" }]);
    expect(document.querySelector(".emvb-style-row")?.textContent).toContain(
      "Min width can't be auto. Enter a number.",
    );
  });

  test("a unit the property doesn't take is refused with the allowed list", async () => {
    await row("letterSpacing");
    await type("2%");
    expect(patches).toEqual([]);
    expect(document.querySelector(".emvb-style-row")?.textContent).toContain(
      "Letter spacing takes px, rem or em.",
    );
    expect(input()?.getAttribute("aria-invalid")).toBe("true");
  });

  test("leaving a field unchanged sends nothing; emptying it clears the value", async () => {
    await row("gap", { gap: { value: 8, unit: "px" } });
    await type("8");
    await type("8px");
    expect(patches).toEqual([]);
    await type("");
    expect(patches).toEqual([{ gap: undefined }]);
  });

  test("text that isn't a number says what to enter", () => {
    expect(parseLengthDraft("wide", "width", "px")).toEqual({
      ok: false,
      message: "Enter a number, such as 16 or 16px.",
    });
    expect(parseLengthDraft("10001", "width", "px")).toEqual({
      ok: false,
      message: "Width can be up to 10000. Enter a smaller number.",
    });
    expect(parseLengthDraft(" .5 em", "fontSize", "px")).toEqual({
      ok: true,
      value: { value: 0.5, unit: "em" },
    });
  });
});

describe("Line height units (W-125)", () => {
  test("a bare number in Line height is a multiple of the font size (em), not pixels", async () => {
    expect(unitsFor("lineHeight")).toEqual(["em", "px", "rem", "%"]);
    await row("lineHeight");
    expect(unitButton()?.getAttribute("aria-label")).toBe("Line height unit (em)");
    await type("1.1");
    await type("24px", "enter");
    expect(patches).toEqual([
      { lineHeight: { value: 1.1, unit: "em" } },
      { lineHeight: { value: 24, unit: "px" } },
    ]);
  });
});
