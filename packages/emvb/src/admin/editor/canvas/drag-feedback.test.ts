import { describe, expect, test } from "bun:test";
import { canDrop, type Layout } from "../../../core/index.ts";
import { dropLineBox } from "./CanvasFrame.tsx";
import { container, heading } from "../../../../test/fixtures/layouts.ts";

const layout: Layout = {
  schemaVersion: 13,
  root: container("root0001", [
    heading("head0001"),
    container("box00001", [heading("head0002")]),
  ]) as Layout["root"],
};

describe("drag feedback (W-019)", () => {
  test("dropLineBox is horizontal in a column container and vertical in a row", () => {
    const box = { top: 0, left: 0, width: 200, height: 100 };
    const kids = [
      { top: 10, left: 0, width: 200, height: 20 },
      { top: 40, left: 0, width: 200, height: 20 },
    ];
    const col = dropLineBox("column", box, kids, 1);
    expect(col.height).toBe(2);
    expect(col.width).toBe(200);
    const rowKids = [
      { top: 0, left: 10, width: 40, height: 100 },
      { top: 0, left: 60, width: 40, height: 100 },
    ];
    const row = dropLineBox("row", box, rowKids, 1);
    expect(row.width).toBe(2);
    expect(row.height).toBe(100);
  });

  test("canDrop refuses a container into its own descendant", () => {
    const intoSelf = canDrop(layout, { kind: "existing", id: "box00001" }, "box00001");
    expect(intoSelf.ok).toBe(false);
    if (!intoSelf.ok) expect(intoSelf.reason).toContain("inside itself");
    const rootFixed = canDrop(layout, { kind: "existing", id: "root0001" }, "box00001");
    expect(rootFixed.ok).toBe(false);
  });

  test("invalid outline CSS uses a dashed danger stroke (contract)", async () => {
    const css = await Bun.file(new URL("../editor-css.ts", import.meta.url)).text();
    expect(css).toContain(".emvb-outline-invalid");
    expect(css).toContain("dashed");
    expect(css).toContain("--color-kumo-danger");
    expect(css).not.toMatch(/\.emvb-outline-invalid[^}]*solid var\(--color-kumo-brand\)/);
  });
});
