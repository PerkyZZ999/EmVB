import { describe, expect, test } from "bun:test";
import {
  cleanClassName,
  duplicateClass,
  emptyDesign,
  MAX_CLASSES,
  renameClass,
  validateDesign,
} from "../index.ts";

const one = (name: string) => ({ ...emptyDesign(), classes: [{ id: "card", name, style: {} }] });

describe("class name and count limits (W-218)", () => {
  test("duplicating a 60-character name stays valid", () => {
    const next = duplicateClass(one("N".repeat(60)), "card");
    expect(next.classes).toHaveLength(2);
    expect(next.classes?.[1]?.name.endsWith(" copy")).toBe(true);
    expect(validateDesign(next).ok).toBe(true);
  });
  test("duplicate refuses at the class cap", () => {
    const full = {
      ...emptyDesign(),
      classes: Array.from({ length: MAX_CLASSES }, (_, i) => ({
        id: `c${i}`,
        name: `C${i}`,
        style: {},
      })),
    };
    expect(duplicateClass(full, "c0")).toBe(full);
  });
  test("rename caps length and drops control characters", () => {
    expect(validateDesign(renameClass(one("A"), "card", "R".repeat(200))).ok).toBe(true);
    expect(cleanClassName(" a\u0000b\nc ")).toBe("a b c");
    expect(renameClass(one("A"), "card", "\n\t").classes?.[0]?.name).toBe("A");
  });
});
