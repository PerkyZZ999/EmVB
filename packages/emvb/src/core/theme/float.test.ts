import { describe, expect, test } from "bun:test";
import { emptyDesign, type DesignSystem } from "../schema/design.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout } from "../schema/layout.ts";
import {
  defaultFloatSettings,
  FLOAT_CHROME_CSS,
  floatHasOwnSurface,
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

  test("a float starts on a surface, so its text is not drawn over the page (W-171)", () => {
    const surface = FLOAT_CHROME_CSS.match(/:where\(\.emvb-float--surface\)\{([^}]*)\}/)?.[1] ?? "";
    expect(surface).toContain("background:#fff");
    expect(surface).toContain("color:#0f172a");
    expect(surface).toContain("padding:");
    expect(FLOAT_CHROME_CSS).toMatch(
      /:where\(\.emvb-float--surface:is\([^)]*\.emvb-float--end-bottom[^)]*\)\)\{border-radius:/,
    );
    const settings = { schemaVersion: 1, edge: "end-bottom", dismiss: false } as const;
    expect(wrapFloatMarkup("f1", "Note", "<p>Hi</p>", settings)).toContain(
      'class="emvb-float emvb-float--end-bottom emvb-float--surface"',
    );
    expect(wrapFloatMarkup("f1", "Note", "<p>Hi</p>", settings, false)).toContain(
      'class="emvb-float emvb-float--end-bottom"',
    );
  });

  test("a float that paints its own background keeps it, without the default surface (W-171)", () => {
    const design = emptyDesign();
    const root = (extra: Partial<Layout["root"]>): Layout => ({
      schemaVersion: LAYOUT_SCHEMA_VERSION,
      root: { id: "root0001", type: "container", props: {}, children: [], ...extra },
    });
    expect(floatHasOwnSurface(root({ style: { gap: { value: 8, unit: "px" } } }), design)).toBe(
      false,
    );
    expect(floatHasOwnSurface(root({ style: { backgroundColor: "#b91c1c" } }), design)).toBe(true);
    expect(
      floatHasOwnSurface(root({ devices: { mobile: { backgroundImage: "/sky.jpg" } } }), design),
    ).toBe(true);
    const banded = {
      ...design,
      classes: [
        {
          id: "band",
          name: "Band",
          style: {
            gradient: {
              type: "linear",
              stops: [
                { color: "#fff", at: 0 },
                { color: "#000", at: 100 },
              ],
            },
          },
        },
      ],
    } as DesignSystem;
    expect(floatHasOwnSurface(root({ classes: ["band"] }), banded)).toBe(true);
    expect(floatHasOwnSurface(root({ classes: ["band"] }), design)).toBe(false);
  });
});
