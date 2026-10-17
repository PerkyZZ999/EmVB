import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { emptyDesign, SCALE_RATIOS, type DesignSystem } from "../../../core/index.ts";
import { cleanup, mount } from "../../../../test/dom/mount.ts";
import { pickOption } from "../../../../test/dom/select.ts";
import { EDITOR_CSS } from "../editor-css.ts";
import { FEATURE_CSS } from "../feature-css.ts";
import { TokenScales } from "./TokenScales.tsx";

afterEach(cleanup);

describe("Scales in Site styles (W-316)", () => {
  test("previews a fluid type scale and adds it to Font sizes", async () => {
    const saved: DesignSystem[] = [];
    await mount(
      <TokenScales
        design={emptyDesign()}
        onSave={async (design) => {
          saved.push(design);
        }}
      />,
    );
    const rows = document.querySelectorAll("[data-emvb-tokens-preview] > li");
    expect(rows.length).toBe(8);
    expect(rows[2]?.textContent).toContain("clamp(");
    await act(async () => {
      (document.querySelector("[data-emvb-tokens-apply]") as HTMLButtonElement).click();
    });
    expect(saved[0]?.variables.fontSizes?.length).toBe(8);
    expect(saved[0]?.variables.fontSizes?.[2]?.fluid).toEqual({ min: 16, max: 18 });
    expect(document.querySelector('[role="status"]')?.textContent).toBe("8 added in Font sizes.");
  });

  test("a base out of range shows why and adds nothing", async () => {
    await mount(<TokenScales design={emptyDesign()} onSave={async () => undefined} />);
    const base = document.querySelector("[data-emvb-tokens-base]") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(base, "200");
      base.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("8 to 64 px");
    expect((document.querySelector("[data-emvb-tokens-apply]") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  const type = async (selector: string, value: string) => {
    const field = document.querySelector(selector) as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const apply = async () => {
    await act(async () => {
      (document.querySelector("[data-emvb-tokens-apply]") as HTMLButtonElement).click();
    });
  };
  const status = () => document.querySelector('[role="status"]')?.textContent ?? null;

  test("a save that fails doesn't report the scale as added (W-609)", async () => {
    await mount(<TokenScales design={emptyDesign()} onSave={async () => false} />);
    await apply();
    expect(status()).toBeNull();
  });

  test("the count says what fit under the list's limit (W-609)", async () => {
    const design = emptyDesign();
    const spacings = Array.from({ length: 95 }, (_, i) => ({
      id: `gap${i}`,
      name: `Gap ${i}`,
      value: { value: i + 1, unit: "px" as const },
    }));
    await mount(
      <TokenScales
        design={{ ...design, variables: { ...design.variables, spacings } }}
        onSave={async () => undefined}
      />,
    );
    await pickOption(document.querySelector("[data-emvb-tokens-kind]"), "space");
    await apply();
    expect(status()).toBe("5 added in Spacing. 4 didn't fit: Spacing holds up to 100.");
  });

  test("a small-screen size out of range says the sizes won't be fluid (W-609)", async () => {
    await mount(<TokenScales design={emptyDesign()} onSave={async () => undefined} />);
    await type("[data-emvb-tokens-min]", "4");
    expect(document.querySelector("[data-emvb-tokens-min-error]")?.textContent).toContain(
      "8 to 64 px",
    );
    await type("[data-emvb-tokens-min]", "14");
    expect(document.querySelector("[data-emvb-tokens-min-error]")).toBeNull();
  });

  test("changing a number clears the last Added message (W-609)", async () => {
    await mount(<TokenScales design={emptyDesign()} onSave={async () => undefined} />);
    await apply();
    expect(status()).toBe("8 added in Font sizes.");
    await type("[data-emvb-tokens-base]", "20");
    expect(status()).toBeNull();
  });

  test("switching the scale, ratio or Fluid clears the last Added message (W-626)", async () => {
    await mount(<TokenScales design={emptyDesign()} onSave={async () => undefined} />);
    const pick = (selector: string, value: string) =>
      pickOption(document.querySelector(selector), value);
    await apply();
    expect(status()).toBe("8 added in Font sizes.");
    await pick("[data-emvb-tokens-kind]", "space");
    expect(status()).toBeNull();
    await pick("[data-emvb-tokens-kind]", "type");
    await apply();
    expect(status()).not.toBeNull();
    await pick("[data-emvb-tokens-ratio]", String(SCALE_RATIOS[0].value));
    expect(status()).toBeNull();
    await apply();
    expect(status()).not.toBeNull();
    await act(async () =>
      (document.querySelector("[data-emvb-tokens-fluid]") as HTMLInputElement).click(),
    );
    expect(status()).toBeNull();
  });
});

test("UX-003: spacing scale bars stop at 64 px so the names beside them stay readable", async () => {
  await mount(<TokenScales design={emptyDesign()} onSave={async () => undefined} />);
  await pickOption(document.querySelector("[data-emvb-tokens-kind]"), "space");
  const widths = [
    ...document.querySelectorAll<HTMLElement>("[data-emvb-tokens-preview] .emvb-tokens-sample"),
  ].map((bar) => Number.parseFloat(bar.style.width));
  expect(widths.length > 0).toBe(true);
  expect(Math.max(...widths)).toBe(64);
});

test("UX-032: each scale value carries its whole clamp() as a tooltip, since the column ellipsizes", async () => {
  await mount(<TokenScales design={emptyDesign()} onSave={async () => undefined} />);
  const codes = [...document.querySelectorAll("[data-emvb-tokens-preview] code")];
  expect(codes.length > 0).toBe(true);
  expect(codes.every((code) => code.getAttribute("title") === code.textContent)).toBe(true);
});

test("UX-057: Ratio and the small-screen size take a full row, and link buttons sit at the start", async () => {
  await mount(<TokenScales design={emptyDesign()} onSave={async () => true} />);
  const full = [...document.querySelectorAll('[data-emvb-tokens-row="full"]')].map(
    (row) => row.querySelector(".emvb-bind-label")?.textContent,
  );
  expect(full).toEqual(["Ratio", "On small screens (px)"]);
  expect(FEATURE_CSS).toContain(
    '.emvb-tokens-grid > [data-emvb-tokens-row="full"] { grid-column: 1 / -1; }',
  );
  expect(EDITOR_CSS).toMatch(/\.emvb-link-button \{[^}]*align-self: flex-start;/);
});
