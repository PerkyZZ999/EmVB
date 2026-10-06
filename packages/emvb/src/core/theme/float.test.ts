import { describe, expect, test } from "bun:test";
import {
  defaultFloatSettings,
  FLOAT_CHROME_CSS,
  validateFloatSettings,
  wrapFloatMarkup,
} from "./float.ts";

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

  test("a close button sits beside the body, not over it (W-165)", () => {
    expect(FLOAT_CHROME_CSS).toContain("display:flex");
    expect(FLOAT_CHROME_CSS.includes("position:absolute")).toBe(false);
    const html = wrapFloatMarkup("float1", "Note", "<p>Saturday</p>", {
      schemaVersion: 1,
      edge: "end-bottom",
      dismiss: true,
    });
    const bodyAt = html.indexOf('class="emvb-float__body"');
    const closeAt = html.indexOf("emvb-float__close");
    expect(bodyAt).toBeGreaterThan(-1);
    expect(closeAt).toBeGreaterThan(bodyAt);
  });
});
