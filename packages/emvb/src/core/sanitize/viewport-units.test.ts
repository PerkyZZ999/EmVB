import { expect, test } from "bun:test";
import { validateLayout } from "../validate.ts";
import { styleDeclarations } from "./css.ts";

const css = (style: unknown) =>
  Object.fromEntries(styleDeclarations(style).declarations.map((d) => [d.property, d.value]));

test("a vh length marked dvh or svh is drawn in that unit (W-974)", () => {
  const out = css({
    minHeight: { value: 100, unit: "vh" },
    height: { value: 50, unit: "vh" },
    paddingTop: { value: 10, unit: "vh" },
    viewportUnits: { minHeight: "dvh", paddingTop: "svh" },
  });
  expect(out["min-height"]).toBe("100dvh");
  expect(out["padding-top"]).toBe("10svh");
  expect(out["height"]).toBe("50vh");
  expect("--emvb-viewport-units" in out).toBe(false);
});

test("only plain vh changes; px, fluid and variables stay as they are", () => {
  const out = css({
    minHeight: { value: 600, unit: "px" },
    height: { fluid: { min: 300, max: 600 } },
    viewportUnits: { minHeight: "dvh", height: "svh" },
  });
  const plain = css({
    minHeight: { value: 600, unit: "px" },
    height: { fluid: { min: 300, max: 600 } },
  });
  expect(out["min-height"]).toBe("600px");
  expect(out["height"]).toBe(plain["height"]);
});

test("the key validates on the 1.x schema; anything else is refused", () => {
  const page = (viewportUnits: unknown) => ({
    schemaVersion: 18,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [],
      style: { minHeight: { value: 100, unit: "vh" }, viewportUnits },
    },
  });
  expect(validateLayout(page({ minHeight: "dvh" })).ok).toBe(true);
  expect(validateLayout(page({ minHeight: "lvh" })).ok).toBe(false);
  expect(validateLayout(page({ color: "dvh" })).ok).toBe(false);
});
