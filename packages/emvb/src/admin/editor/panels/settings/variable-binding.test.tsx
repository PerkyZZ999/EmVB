import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { DesignSystem, StyleProps } from "../../../../core/index.ts";
import { cleanup, mount, settle } from "../../../../../test/dom/mount.ts";
import { StyleRow } from "./StyleRow.tsx";
import type { StyleKey } from "./style-sections.ts";
import { bindKind } from "./VariableBinding.tsx";

afterEach(cleanup);

const px = (value: number, unit: "px" | "rem" = "px") => ({ value, unit });
const design: DesignSystem = {
  schemaVersion: 3,
  variables: {
    colors: [],
    fonts: [
      { id: "body", name: "Body", value: "Inter, sans-serif" },
      { id: "odd", name: "Odd", value: "url(x)" },
    ],
    fontSizes: [
      { id: "sm", name: "Small", value: px(12) },
      { id: "lg", name: "Large", value: px(1.5, "rem") },
    ],
    spacings: [],
  },
};

let patches: Partial<StyleProps>[] = [];
afterEach(() => {
  patches = [];
});

const row = (styleKey: StyleKey, style: StyleProps = {}) =>
  mount(
    <StyleRow
      styleKey={styleKey}
      style={style}
      design={design}
      onPatch={(patch) => patches.push(patch)}
      onDesignChange={async () => undefined}
    />,
  );

const varButton = () => document.querySelector<HTMLButtonElement>(".emvb-var-btn");
const options = () =>
  [...document.querySelectorAll("[data-emvb-var-option]")].map((el) => el.textContent);

async function openMenu() {
  await act(async () => varButton()?.click());
  await settle();
}

describe("variable button and chip (W-087)", () => {
  test("only font, font size and spacing properties get a variable button", () => {
    expect(bindKind("fontFamily")).toBe("font");
    expect(bindKind("fontSize")).toBe("fontSize");
    for (const key of ["gap", "paddingTop", "marginLeft", "borderRadius"] as StyleKey[]) {
      expect(bindKind(key)).toBe("spacing");
    }
    for (const key of ["width", "lineHeight", "letterSpacing", "borderWidth"] as StyleKey[]) {
      expect(bindKind(key)).toBeNull();
    }
  });

  test("a row without a kind has no variable button", async () => {
    await row("width");
    expect(varButton()?.tagName ?? null).toBeNull();
  });

  test("the button lists the kind's variables with their values and binds one", async () => {
    await row("fontSize");
    expect(varButton()?.getAttribute("aria-label")).toBe("Use a variable for Font size");
    await openMenu();
    expect(options()).toEqual(["AaSmall12px", "AaLarge1.5rem"]);
    const large = document.querySelector('[data-emvb-var-option="lg"]') as HTMLElement | null;
    await act(async () => large?.click());
    expect(patches).toEqual([{ fontSize: { var: "lg", from: "fontSize" } }]);
  });

  test("with no variables of the kind the menu says where to add them", async () => {
    await row("gap");
    await openMenu();
    const item = document.querySelector('[role="menuitem"]');
    expect(item?.textContent).toBe("No spacing variables yet. Add them in Site styles.");
    expect(item?.hasAttribute("data-disabled")).toBe(true);
  });

  test("a bound value shows a chip; × detaches and keeps the variable's value", async () => {
    await row("fontSize", { fontSize: { var: "lg", from: "fontSize" } });
    const chip = document.querySelector("[data-emvb-var-bound='lg'] .emvb-var-chip");
    expect(chip?.textContent).toBe("Large1.5rem");
    expect(document.querySelector("input")?.tagName ?? null).toBeNull();
    expect(varButton()?.getAttribute("data-active")).toBe("true");
    await openMenu();
    expect(
      document.querySelector('[data-emvb-var-option="lg"]')?.getAttribute("data-selected"),
    ).toBe("true");
    const x = document.querySelector<HTMLButtonElement>(
      '[aria-label="Detach Large from Font size"]',
    );
    await act(async () => x?.click());
    expect(patches).toEqual([{ fontSize: { value: 1.5, unit: "rem" } }]);
  });

  test("a chip for a deleted variable says so, and × clears the value", async () => {
    await row("fontSize", { fontSize: { var: "gone", from: "fontSize" } });
    const chip = document.querySelector(".emvb-var-chip");
    expect(chip?.getAttribute("data-missing")).toBe("true");
    expect(chip?.textContent).toBe("Missing (gone)");
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="Detach gone from Font size"]')
        ?.click(),
    );
    expect(patches).toEqual([{ fontSize: undefined }]);
  });

  test("a font binds and detaches too; an unsafe stack detaches to the default", async () => {
    await row("fontFamily");
    await openMenu();
    await act(async () =>
      (document.querySelector('[data-emvb-var-option="body"]') as HTMLElement | null)?.click(),
    );
    await row("fontFamily", { fontFamily: { var: "body", from: "font" } });
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="Detach Body from Font family"]')
        ?.click(),
    );
    await row("fontFamily", { fontFamily: { var: "odd", from: "font" } });
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="Detach Odd from Font family"]')
        ?.click(),
    );
    expect(patches).toEqual([
      { fontFamily: { var: "body", from: "font" } },
      { fontFamily: "Inter, sans-serif" },
      { fontFamily: undefined },
    ]);
  });

  test("a spacing ref on Font size shows a spacing chip, not a raw var: draft (W-088)", async () => {
    await mount(
      <StyleRow
        styleKey="fontSize"
        style={{ fontSize: { var: "md", from: "spacing" } }}
        design={{
          ...design,
          variables: {
            ...design.variables,
            spacings: [{ id: "md", name: "Medium", value: px(16) }],
          },
        }}
        onPatch={(patch) => patches.push(patch)}
        onDesignChange={async () => undefined}
      />,
    );
    expect(document.querySelector("input")?.tagName ?? null).toBeNull();
    expect(document.querySelector("[data-emvb-var-bound='md'] .emvb-var-chip")?.textContent).toBe(
      "Medium16px",
    );
    await openMenu();
    expect(
      document.querySelector('[data-emvb-var-option][data-selected="true"]')?.tagName ?? null,
    ).toBeNull();
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="Detach Medium from Font size"]')
        ?.click(),
    );
    expect(patches).toEqual([{ fontSize: { value: 16, unit: "px" } }]);
  });

  test("a spacing ref named like a font size isn't marked as that font size", async () => {
    await row("fontSize", { fontSize: { var: "sm", from: "spacing" } });
    expect(document.querySelector(".emvb-var-chip")?.getAttribute("data-missing")).toBe("true");
    await openMenu();
    expect(
      document.querySelector('[data-emvb-var-option="sm"]')?.getAttribute("data-selected") ?? null,
    ).toBeNull();
  });
});
