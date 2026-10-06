import { describe, expect, test } from "bun:test";
import { defaultFloatSettings, validateFloatSettings, wrapFloatMarkup } from "./float.ts";

describe("float settings", () => {
  test("a top bar without a close button is the default", () => {
    expect(defaultFloatSettings()).toEqual({ schemaVersion: 1, edge: "top", dismiss: false });
    expect(validateFloatSettings(defaultFloatSettings()).ok).toBe(true);
  });

  test("a corner with a close button is kept, and a bad edge is refused", () => {
    const ok = validateFloatSettings({ schemaVersion: 1, edge: "end-bottom", dismiss: true });
    expect(ok.ok && ok.settings.edge).toBe("end-bottom");
    const bad = validateFloatSettings({ schemaVersion: 1, edge: "left", dismiss: false });
    expect(bad.ok).toBe(false);
  });

  test("markup pins the edge and adds a close button only when dismiss is on", () => {
    const open = wrapFloatMarkup("float1", "Sale", "<p>Half off</p>", {
      schemaVersion: 1,
      edge: "top",
      dismiss: false,
    });
    expect(open).toContain('data-emvb-float-edge="top"');
    expect(open).toContain('aria-label="Sale"');
    expect(open.includes("data-emvb-float-dismiss")).toBe(false);
    const closing = wrapFloatMarkup("float1", "Sale", "<p>Half off</p>", {
      schemaVersion: 1,
      edge: "top",
      dismiss: true,
    });
    expect(closing).toContain("data-emvb-float-dismiss");
    expect(closing).toContain('aria-label="Close"');
  });
});
