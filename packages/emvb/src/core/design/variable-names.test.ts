import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../index.ts";
import type { DesignSystem } from "../index.ts";
import { duplicateVariable, renameVariable, variableNameTaken } from "./variables.ts";

const design: DesignSystem = {
  ...emptyDesign(),
  variables: {
    ...emptyDesign().variables,
    colors: [
      { id: "brand", name: "Brand", value: "#112233" },
      { id: "brand-copy", name: "Brand copy", value: "#112233" },
      { id: "ink", name: "Ink", value: "#000000" },
    ],
    fonts: [{ id: "ink", name: "Ink", value: "Georgia, serif" }],
  },
};

describe("W-278: variable names stay unique per kind", () => {
  test("variableNameTaken ignores case and spacing, the variable itself, and other kinds", () => {
    expect(variableNameTaken(design, "color", " INK ")).toBe(true);
    expect(variableNameTaken(design, "color", "Ink", "ink")).toBe(false);
    expect(variableNameTaken(design, "font", "Brand")).toBe(false);
  });

  test("renameVariable refuses a taken name but allows a case change of its own", () => {
    expect(renameVariable(design, "ink", "color", "brand")).toBe(design);
    expect(renameVariable(design, "ink", "color", "INK").variables.colors[2]?.name).toBe("INK");
  });

  test("duplicateVariable picks a free name when the copy name is taken", () => {
    const first = duplicateVariable(design, "brand", "color");
    expect(first.variables.colors.map((c) => c.name)).toEqual([
      "Brand",
      "Brand copy",
      "Ink",
      "Brand copy 2",
    ]);
    expect(duplicateVariable(first, "brand", "color").variables.colors.at(-1)?.name).toBe(
      "Brand copy 3",
    );
  });
});
