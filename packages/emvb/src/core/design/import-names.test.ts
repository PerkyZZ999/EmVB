import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../index.ts";
import type { DesignSystem } from "../index.ts";
import { designFromJson, designToJson, uniqueImportNames } from "./transfer.ts";

const repeated: DesignSystem = {
  ...emptyDesign(),
  variables: {
    ...emptyDesign().variables,
    colors: [
      { id: "brand", name: "Brand", value: "#112233" },
      { id: "brand-b", name: "brand", value: "#445566" },
      { id: "brand-2", name: "Brand 2", value: "#778899" },
    ],
    fonts: [{ id: "brand", name: "Brand", value: "Inter, sans-serif" }],
  },
  classes: [
    { id: "card", name: "Card", style: {} },
    { id: "card-b", name: "Card", style: {} },
    { id: "long", name: "L".repeat(60), style: {} },
    { id: "long-b", name: "L".repeat(60), style: {} },
  ],
};

describe("W-283: Import keeps names unique", () => {
  test("later repeats get the next free number; ids and other kinds stay as they are", () => {
    const { design, renamed } = uniqueImportNames(repeated);
    expect(design.classes?.map((c) => [c.id, c.name])).toEqual([
      ["card", "Card"],
      ["card-b", "Card 2"],
      ["long", "L".repeat(60)],
      ["long-b", `${"L".repeat(58)} 2`],
    ]);
    expect(design.variables.colors?.map((c) => c.name)).toEqual(["Brand", "brand 3", "Brand 2"]);
    expect(design.variables.fonts?.map((f) => f.name)).toEqual(["Brand"]);
    expect(renamed).toEqual([
      { from: "Card", to: "Card 2" },
      { from: "L".repeat(60), to: `${"L".repeat(58)} 2` },
      { from: "brand", to: "brand 3" },
    ]);
  });

  test("a file without repeats comes back unchanged, and designFromJson reports renames", () => {
    const clean = { ...emptyDesign(), classes: [{ id: "card", name: "Card", style: {} }] };
    expect(uniqueImportNames(clean)).toEqual({ design: clean, renamed: [] });
    const result = designFromJson(designToJson(repeated));
    expect(result.ok && result.renamed.length).toBe(3);
  });
});
