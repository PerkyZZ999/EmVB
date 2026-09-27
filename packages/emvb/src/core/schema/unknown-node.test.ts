import { describe, expect, test } from "bun:test";
import { moveNode, REASONS } from "../arrange.ts";
import { renderPage } from "../render/index.ts";
import { emptyDesign } from "../schema/design.ts";
import { removeNode } from "../tree-ops.ts";
import { validateLayout } from "../validate.ts";
import { container, heading } from "../../../test/fixtures/layouts.ts";

const withUnknown = {
  schemaVersion: 1 as const,
  root: {
    id: "root0001",
    type: "container" as const,
    props: {},
    children: [
      { id: "head0001", type: "heading" as const, props: { text: "Hi", level: 1 } },
      {
        id: "car00001",
        type: "carousel",
        props: { slides: 3 },
        children: [
          { id: "head0002", type: "heading" as const, props: { text: "Slide", level: 2 } },
        ],
      },
    ],
  },
};

describe("unknown nodes (W-022, R-033)", () => {
  test("validateLayout keeps unknown nodes and still refuses bad ids", () => {
    const ok = validateLayout(withUnknown);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.layout.root.children.some((c) => c.type === "carousel")).toBe(true);

    const badId = structuredClone(withUnknown);
    (badId.root.children[1] as { id: string }).id = "!!";
    expect(validateLayout(badId).ok).toBe(false);
  });

  test("validateLayout still refuses nesting past the depth limit when unknowns are present", () => {
    let kids: unknown = { id: "leaf0001", type: "heading", props: { text: "x", level: 1 } };
    // 25 levels of unknown wrappers under the root → depth 26 at the leaf (limit 24).
    for (let i = 0; i < 25; i++) {
      kids = {
        id: `u${String(i).padStart(7, "0")}`,
        type: "carousel",
        props: {},
        children: [kids],
      };
    }
    const deep = {
      schemaVersion: 1 as const,
      root: {
        id: "root0001",
        type: "container" as const,
        props: {},
        children: [kids],
      },
    };
    const result = validateLayout(deep);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.code === "too_deep")).toBe(true);
  });

  test("public render omits unknown nodes; editor shows a selectable placeholder", () => {
    const ok = validateLayout(withUnknown);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    const pub = renderPage(ok.layout, emptyDesign(), { mode: "public" });
    expect(pub.html).toContain("Hi");
    expect(pub.html).not.toContain("carousel");
    expect(pub.html).not.toContain("Unknown element");
    expect(pub.warnings.some((w) => w.code === "unknown-type")).toBe(true);

    const editor = renderPage(ok.layout, emptyDesign(), { mode: "editor" });
    expect(editor.html).toContain('Unknown element "carousel"');
    expect(editor.html).toContain('data-emvb-id="car00001"');
  });

  test("an unknown node can be moved and deleted like any other element", () => {
    const ok = validateLayout(withUnknown);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    const moved = moveNode(ok.layout, "car00001", "root0001", 0);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.layout.root.children.map((c) => c.id)).toEqual(["car00001", "head0001"]);

    const gone = removeNode(moved.layout, "car00001");
    expect(gone.removed?.node.type).toBe("carousel");
    expect(gone.layout.root.children.map((c) => c.id)).toEqual(["head0001"]);
  });

  test("unknown nodes are not drop targets", () => {
    const ok = validateLayout(withUnknown);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(moveNode(ok.layout, "head0001", "car00001", 0)).toEqual({
      ok: false,
      reason: REASONS.notContainer,
    });
  });

  test("a page of only known nodes still validates", () => {
    const layout = {
      schemaVersion: 1 as const,
      root: container("root0001", [heading("head0001")]) as never,
    };
    expect(validateLayout(layout).ok).toBe(true);
  });
});
