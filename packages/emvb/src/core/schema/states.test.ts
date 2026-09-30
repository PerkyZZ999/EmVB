import { describe, expect, test } from "bun:test";
import { s1Page } from "../../../test/fixtures/layouts.ts";
import { validateDesign, validateLayout } from "../validate.ts";
import { DESIGN_SCHEMA_VERSION } from "./design.ts";
import { StyleStates } from "./style.ts";

const withStates = (states: unknown) => {
  const page = s1Page();
  const [first, ...rest] = page.root.children;
  return { ...page, root: { ...page.root, children: [{ ...first, states }, ...rest] } };
};

const designWith = (states: unknown) => ({
  schemaVersion: DESIGN_SCHEMA_VERSION,
  variables: { colors: [{ id: "ink", name: "Ink", value: "#112233" }] },
  classes: [{ id: "card", name: "Card", style: {}, states }],
});

const hover = { color: "#ff0000", backgroundColor: { var: "ink" }, opacity: 0.8 };

describe("state styles (D-032, W-089)", () => {
  test("a node keeps hover, focus and active styles", () => {
    const states = { hover, focus: { borderColor: "#00ff00" }, active: { opacity: 0.5 } };
    const result = validateLayout(withStates(states));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.layout.root.children[0]?.states).toEqual(states);
  });

  test("a class keeps its state styles", () => {
    const result = validateDesign(designWith({ hover }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.classes?.[0]?.states).toEqual({ hover });
  });

  test("an unknown state is refused with its path", () => {
    const result = validateLayout(withStates({ visited: hover }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.path).toBe("root.children[0].states");
    expect(validateDesign(designWith({ focusWithin: hover })).ok).toBe(false);
  });

  test("a state value gets the same limits as style", () => {
    for (const bad of [{ opacity: 2 }, { color: "red;}" }, { zIndex: 1.5 }, { unknownKey: 1 }]) {
      expect(StyleStates.safeParse({ hover: bad }).success).toBe(false);
      expect(validateLayout(withStates({ active: bad })).ok).toBe(false);
    }
  });
});
