import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { auditPage } from "./audit.ts";

const hiddenRules = (field: Record<string, unknown>) =>
  auditPage(
    {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "head0001", type: "heading", props: { text: "T", level: 1 } },
          { id: "fiel0001", ...field, attributes: [{ name: "aria-hidden", value: "true" }] },
        ],
      },
    } as unknown as Layout,
    emptyDesign(),
  )
    .issues.filter((i) => i.rule === "hidden-focusable")
    .map((i) => i.nodeId);

describe("aria-hidden form controls (W-650)", () => {
  for (const type of ["select", "textarea", "checkbox", "radio"]) {
    test(`a ${type} with aria-hidden is reported`, () => {
      expect(hiddenRules({ type, props: { name: "f", label: "Pick" } })).toEqual(["fiel0001"]);
    });
  }
  test("a submit button with aria-hidden is reported", () => {
    expect(hiddenRules({ type: "submit", props: { text: "Send" } })).toEqual(["fiel0001"]);
  });
});
