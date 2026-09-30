import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import { hasStateStyles, patchClassState, patchStates } from "./states.ts";

describe("state style edits (W-089)", () => {
  test("patchStates sets, clears and drops empty states", () => {
    const one = patchStates(undefined, "hover", { opacity: 0.5 });
    expect(one).toEqual({ hover: { opacity: 0.5 } });
    const two = patchStates(one, "active", { color: "#ff0000" });
    expect(two).toEqual({ hover: { opacity: 0.5 }, active: { color: "#ff0000" } });
    expect(patchStates(two, "hover", { opacity: undefined })).toEqual({
      active: { color: "#ff0000" },
    });
    expect(patchStates({ focus: { opacity: 1 } }, "focus", { opacity: undefined })).toBeUndefined();
    expect(one).toEqual({ hover: { opacity: 0.5 } });
  });

  test("a transition never lands in a state", () => {
    expect(
      patchStates(undefined, "hover", {
        transition: { duration: 100, easing: "ease", property: "all" },
      }),
    ).toBeUndefined();
  });

  test("patchClassState edits one class's state and leaves the rest", () => {
    const design = {
      ...emptyDesign(),
      classes: [
        { id: "card", name: "Card", style: { opacity: 0.7 } },
        { id: "tint", name: "Tint", style: {} },
      ],
    };
    const next = patchClassState(design, "card", "focus", { opacity: 0.4 });
    expect(next.classes?.[0]).toEqual({
      id: "card",
      name: "Card",
      style: { opacity: 0.7 },
      states: { focus: { opacity: 0.4 } },
    });
    expect(next.classes?.[1]).toBe(design.classes[1]);
    expect(patchClassState(next, "card", "focus", { opacity: undefined }).classes?.[0]).toEqual(
      design.classes[0],
    );
    expect(patchClassState(design, "missing", "hover", { opacity: 1 })).toBe(design);
  });

  test("hasStateStyles is true only when a state has a value", () => {
    expect(hasStateStyles({})).toBe(false);
    expect(hasStateStyles({ states: {} })).toBe(false);
    expect(hasStateStyles({ states: { hover: {} } })).toBe(false);
    expect(hasStateStyles({ states: { active: { opacity: 0.2 } } })).toBe(true);
    expect(hasStateStyles(undefined)).toBe(false);
  });
});
