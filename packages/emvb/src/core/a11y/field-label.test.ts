import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { auditPage } from "./audit.ts";

const messages = (field: Record<string, unknown>) =>
  auditPage(
    {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "head0001", type: "heading", props: { text: "T", level: 1 } },
          {
            id: "form0001",
            type: "form",
            props: { formId: "f1" },
            children: [{ id: "fild0001", ...field } as LayoutNode],
          },
        ],
      },
    } as Layout,
    emptyDesign(),
  )
    .issues.filter((i) => i.rule === "control-name")
    .map((i) => i.message);

describe("form fields need a label (W-416)", () => {
  test("no label, or only a placeholder, is flagged", () => {
    expect(messages({ type: "text-input", props: { field: "email" } })[0]).toContain("no label");
    expect(
      messages({ type: "text-input", props: { field: "email", placeholder: "Email" } })[0],
    ).toContain("only a placeholder");
    expect(messages({ type: "checkbox", props: { field: "ok", label: " " } })).toHaveLength(1);
  });
  test("a label is fine", () => {
    expect(messages({ type: "textarea", props: { field: "msg", label: "Message" } })).toEqual([]);
  });
});
