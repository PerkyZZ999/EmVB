import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { NumberRow, type NumberSpec } from "./NumberRow.tsx";

afterEach(cleanup);

// W-091: the plain number rows (opacity, z-index, line height…) were only reached through the
// Style tab tests; the parse rules, scale and reset weren't checked directly.

const OPACITY: NumberSpec = { min: 0, max: 100, scale: 100, example: "50", suffix: "%" };
const Z_INDEX: NumberSpec = {
  min: -10,
  max: 999,
  integer: true,
  example: "10",
  placeholder: "auto",
};

async function row(spec: NumberSpec, value: number | undefined, inherited?: number) {
  const sent: (number | undefined)[] = [];
  const host = await mount(
    <NumberRow
      rowKey="n"
      label="Amount"
      value={value}
      spec={spec}
      inherited={inherited}
      onCommit={(next) => sent.push(next)}
    />,
  );
  const input = () => {
    const el = host.querySelector<HTMLInputElement>("[data-emvb-number='n']");
    if (!el) throw new Error("no number field");
    return el;
  };
  const type = async (text: string, how: "enter" | "blur" = "enter") => {
    const el = input();
    await act(async () => {
      el.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      if (how === "enter")
        el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      else el.blur();
    });
  };
  const error = () => host.textContent ?? "";
  const reset = () =>
    host.querySelector<HTMLButtonElement>("button[aria-label='Reset Amount to default']");
  return { host, sent, input, type, error, reset };
}

describe("NumberRow (W-091)", () => {
  test("a scaled value shows in display units and commits back in stored units", async () => {
    const r = await row(OPACITY, 0.25);
    expect(r.input().value).toBe("25");
    expect(r.host.textContent ?? "").toContain("Amount (%)");
    await r.type("40");
    await r.type("33.3", "blur");
    expect(r.sent).toEqual([0.4, 0.333]);
  });

  test("the same value isn't committed again, and an empty field unsets", async () => {
    const r = await row(Z_INDEX, 5);
    await r.type("5");
    expect(r.sent).toEqual([]);
    await r.type("  ");
    expect(r.sent).toStrictEqual([undefined]);
  });

  test("non-numbers, fractions of an integer field and out-of-range values are refused", async () => {
    const r = await row(Z_INDEX, undefined);
    await r.type("1e3");
    expect(r.error()).toContain("Enter a number, such as 10.");
    expect(r.input().getAttribute("aria-invalid")).toBe("true");
    await r.type("2.5");
    expect(r.error()).toContain("Amount must be a whole number.");
    await r.type("1000");
    expect(r.error()).toContain("Amount can be from -10 to 999.");
    await r.type("-11");
    expect(r.error()).toContain("Amount can be from -10 to 999.");
    expect(r.sent).toEqual([]);
    await r.type("-10");
    await r.type("999");
    await r.type(".5", "blur");
    expect(r.sent).toEqual([-10, 999]);
    expect(r.error()).toContain("whole number");
  });

  test("a valid entry clears the error", async () => {
    const r = await row(OPACITY, undefined);
    await r.type("abc");
    expect(r.error()).toContain("Enter a number, such as 50.");
    await r.type("100");
    expect(r.error()).not.toContain("Enter a number");
    expect(r.input().getAttribute("aria-invalid")).toBeNull();
    expect(r.sent).toEqual([1]);
  });

  test("the placeholder is the spec's, or the inherited Normal value in display units", async () => {
    const plain = await row(Z_INDEX, undefined);
    expect(plain.input().placeholder).toBe("auto");
    expect(
      plain.host.querySelector("[data-emvb-style='n']")?.getAttribute("data-inherited"),
    ).toBeNull();
    await cleanup();
    const inherited = await row(OPACITY, undefined, 0.5);
    expect(inherited.input().placeholder).toBe("50");
    expect(
      inherited.host.querySelector("[data-emvb-style='n']")?.getAttribute("data-inherited"),
    ).toBe("true");
  });

  test("reset is disabled until the value is set, then unsets it", async () => {
    const unset = await row(Z_INDEX, undefined);
    expect(unset.reset()?.disabled).toBe(true);
    expect(unset.host.querySelector("[data-emvb-style='n']")?.getAttribute("data-set")).toBeNull();
    await cleanup();
    const set = await row(Z_INDEX, 3);
    expect(set.reset()?.disabled).toBe(false);
    expect(set.host.querySelector("[data-emvb-style='n']")?.getAttribute("data-set")).toBe("true");
    await act(async () => set.reset()?.click());
    expect(set.sent).toStrictEqual([undefined]);
  });
});
