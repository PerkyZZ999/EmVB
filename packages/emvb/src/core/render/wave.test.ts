import { describe, expect, test } from "bun:test";
import { emptyDesign, type DesignSystem } from "../schema/design.ts";
import { designFromJson, designToJson } from "../design/transfer.ts";

describe("design transfer (W-103)", () => {
  test("export then import keeps variables and classes", () => {
    const source: DesignSystem = {
      ...emptyDesign(),
      variables: { colors: [{ id: "ink", name: "Ink", value: "#112233" }] },
      classes: [{ id: "card", name: "Card", style: { color: { var: "ink" } } }],
    };
    const back = designFromJson(designToJson(source));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.design.variables.colors[0]?.value).toBe("#112233");
  });

  test("a newer design file is refused", () => {
    const result = designFromJson(JSON.stringify({ ...emptyDesign(), schemaVersion: 10 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("That design was saved by a newer EmVB.");
  });
});
