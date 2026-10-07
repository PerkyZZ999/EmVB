import { describe, expect, test } from "bun:test";
import {
  duplicateVariable,
  emptyDesign,
  MAX_VARIABLES,
  renameVariable,
  validateDesign,
  variableListFull,
} from "../index.ts";

const withColors = (n: number, name = "Brand") => {
  const d = emptyDesign();
  return {
    ...d,
    variables: {
      ...d.variables,
      colors: Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name, value: "#123456" })),
    },
  };
};

describe("variable name and count limits (W-219)", () => {
  test("duplicating a 60-character name stays valid", () => {
    const next = duplicateVariable(withColors(1, "N".repeat(60)), "c0", "color");
    expect(next.variables.colors).toHaveLength(2);
    expect(validateDesign(next).ok).toBe(true);
  });
  test("duplicate refuses at the cap", () => {
    const full = withColors(MAX_VARIABLES.color);
    expect(variableListFull(full, "color")).toBe(true);
    expect(duplicateVariable(full, "c0", "color")).toBe(full);
  });
  test("rename caps the name at 60 characters", () => {
    const next = renameVariable(withColors(1), "c0", "color", "R".repeat(200));
    expect(validateDesign(next).ok).toBe(true);
  });
});
