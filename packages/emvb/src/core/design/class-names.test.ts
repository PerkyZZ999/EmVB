import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../index.ts";
import type { DesignSystem } from "../index.ts";
import { classNameTaken, duplicateClass, renameClass } from "./classes.ts";

const design: DesignSystem = {
  ...emptyDesign(),
  classes: [
    { id: "card", name: "Card", style: {} },
    { id: "card-copy", name: "Card copy", style: {} },
    { id: "note", name: "Note", style: {} },
  ],
};

describe("W-277: class names stay unique", () => {
  test("classNameTaken ignores case, spacing and the class being renamed", () => {
    expect(classNameTaken(design, "  note ")).toBe(true);
    expect(classNameTaken(design, "NOTE")).toBe(true);
    expect(classNameTaken(design, "Note", "note")).toBe(false);
    expect(classNameTaken(design, "Panel")).toBe(false);
  });

  test("renameClass refuses another class's name but allows a case change of its own", () => {
    expect(renameClass(design, "note", "card")).toBe(design);
    expect(renameClass(design, "note", "NOTE").classes?.[2]?.name).toBe("NOTE");
  });

  test("duplicateClass picks a free name when the copy name is taken", () => {
    const first = duplicateClass(design, "card");
    const names = first.classes?.map((c) => c.name);
    expect(names).toEqual(["Card", "Card copy", "Note", "Card copy 2"]);
    const second = duplicateClass(first, "card");
    expect(second.classes?.at(-1)?.name).toBe("Card copy 3");
  });
});
