import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { validateDesign } from "../validate.ts";
import { renderPage } from "./index.ts";

const layout = {
  schemaVersion: 13,
  root: { id: "root0001", type: "container", props: {}, children: [] },
} as unknown as Layout;

describe("site text direction (W-230)", () => {
  test("ltr, rtl and auto are valid; anything else is refused", () => {
    for (const direction of ["ltr", "rtl", "auto"])
      expect(validateDesign({ ...emptyDesign(), direction }).ok).toBe(true);
    expect(validateDesign({ ...emptyDesign(), direction: "sideways" }).ok).toBe(false);
  });

  test("the root carries dir and the result reports it for <html dir>", () => {
    const rtl = renderPage(layout, { ...emptyDesign(), direction: "rtl" }, { scope: "p1" });
    expect(rtl.html).toContain('class="emvb-root emvb-container" dir="rtl"');
    expect(rtl.dir).toBe("rtl");
    const editor = renderPage(layout, { ...emptyDesign(), direction: "rtl" }, { mode: "editor" });
    expect(editor.html).toContain('dir="rtl"');
  });

  test("unset direction adds nothing", () => {
    const plain = renderPage(layout, emptyDesign());
    expect(plain.html).not.toContain("dir=");
    expect(plain.dir).toBeUndefined();
  });
});
