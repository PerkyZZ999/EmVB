import { describe, expect, test } from "bun:test";
import { validateLayout } from "../../../../core/index.ts";
import { fieldNameError } from "./FieldBindControl.tsx";

const saves = (field: string) =>
  validateLayout({
    schemaVersion: 13,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        {
          id: "form0001",
          type: "form",
          props: { formId: "" },
          children: [{ id: "input001", type: "text-input", props: { field, label: "L" } }],
        },
      ],
    },
  }).ok;

describe("Field name checks as you type (W-202)", () => {
  test("a name is accepted exactly when the page would save with it", () => {
    for (const name of [
      "email",
      "a",
      "first_name",
      "x-1",
      "1abc",
      "my field",
      "é",
      "_hp",
      "",
      "a".repeat(80),
      "a".repeat(81),
    ]) {
      expect([name, fieldNameError(name) === null]).toEqual([name, saves(name)]);
    }
  });
  test("each refusal says what to do", () => {
    expect(fieldNameError("")).toBe("Give the field a name.");
    expect(fieldNameError("my field")).toContain("no spaces");
    expect(fieldNameError("a".repeat(81))).toBe("Use at most 80 characters.");
  });
});
