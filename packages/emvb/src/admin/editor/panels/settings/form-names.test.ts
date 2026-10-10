import { describe, expect, test } from "bun:test";
import type { Layout } from "../../../../core/index.ts";
import { duplicateFieldName } from "./form-names.ts";

const input = (id: string, field: string) => ({
  id,
  type: "text-input",
  props: { field, label: id },
});
const layout = (children: unknown[]): Layout =>
  ({
    schemaVersion: 14,
    root: {
      id: "root",
      type: "container",
      props: {},
      children: [
        { id: "form1", type: "form", props: { formId: "" }, children },
        { id: "form2", type: "form", props: { formId: "" }, children: [input("other", "email")] },
        input("loose", "email"),
      ],
    },
  }) as unknown as Layout;

describe("duplicateFieldName (W-194)", () => {
  test("flags two controls in one form with the same name", () => {
    const l = layout([
      input("a", "email"),
      { id: "box", type: "div-block", props: {}, children: [input("b", " email ")] },
    ]);
    expect(duplicateFieldName(l, "a")).toBe(true);
    expect(duplicateFieldName(l, "b")).toBe(true);
  });
  test("ignores same names in other forms or outside forms, and empty names", () => {
    const l = layout([input("a", "email"), input("c", ""), input("d", "")]);
    expect(duplicateFieldName(l, "a")).toBe(false);
    expect(duplicateFieldName(l, "other")).toBe(false);
    expect(duplicateFieldName(l, "loose")).toBe(false);
    expect(duplicateFieldName(l, "c")).toBe(false);
  });
});
