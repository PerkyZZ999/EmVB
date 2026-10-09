import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { emptyDesign, type DesignSystem } from "../../../core/index.ts";
import { cleanup, mount } from "../../../../test/dom/mount.ts";
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
});
