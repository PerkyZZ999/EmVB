import { describe, expect, test } from "bun:test";
import { canDrop } from "./arrange.ts";
import type { Layout, LayoutNode } from "./schema/layout.ts";
import { Layout as LayoutSchema } from "./schema/layout.ts";

const page = (children: LayoutNode[]): Layout => ({
  schemaVersion: 9,
  root: { id: "root0001", type: "container", props: {}, children },
});

describe("form drop rules (W-034)", () => {
  test("a form may go into a layout container but not into another form", () => {
    const layout = page([
      {
        id: "form0001",
        type: "form",
        props: { formId: "abc" },
        children: [],
      },
      { id: "box00001", type: "container", props: {}, children: [] },
    ]);
    expect(
      canDrop(
        layout,
        {
          kind: "new",
          node: { id: "form0002", type: "form", props: { formId: "x" }, children: [] },
        },
        "box00001",
      ).ok,
    ).toBe(true);
    expect(
      canDrop(
        layout,
        {
          kind: "new",
          node: { id: "form0002", type: "form", props: { formId: "x" }, children: [] },
        },
        "form0001",
      ),
    ).toEqual({ ok: false, reason: "A form can't go inside another form." });
  });

  test("form fields must be placed inside a form", () => {
    const layout = page([
      {
        id: "form0001",
        type: "form",
        props: { formId: "abc" },
        children: [],
      },
    ]);
    const field: LayoutNode = {
      id: "inp00001",
      type: "text-input",
      props: { field: "email", label: "Email" },
    };
    expect(canDrop(layout, { kind: "new", node: field }, "root0001")).toEqual({
      ok: false,
      reason: "Form fields must be placed inside a form.",
    });
    expect(canDrop(layout, { kind: "new", node: field }, "form0001").ok).toBe(true);
  });

  test("schema accepts a form tree with inputs", () => {
    const layout = page([
      {
        id: "form0001",
        type: "form",
        props: { formId: "01ABCDEFGHJKMNPQRSTVWXYZ" },
        children: [
          { id: "inp00001", type: "text-input", props: { field: "email", label: "Email" } },
          { id: "sub00001", type: "submit", props: { label: "Send" } },
        ],
      },
    ]);
    expect(LayoutSchema.safeParse(layout).success).toBe(true);
  });
});
