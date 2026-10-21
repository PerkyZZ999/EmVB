import { describe, expect, test } from "bun:test";
import { EDITOR_CSS } from "./editor/editor-css.ts";
import { FEATURE_CSS } from "./editor/feature-css.ts";
import { IMAGE_EDITOR_CSS } from "./image-editor/image-editor-css.ts";
import { UI_CSS } from "./ui.ts";

// W-858: the kumo-design rules every editor surface follows. Kumo's own components already do;
// these check EmVB's CSS on top of them.
const SHEETS = { UI_CSS, EDITOR_CSS, FEATURE_CSS, IMAGE_EDITOR_CSS };

/** Each rule block as "selector { body }", so a failure names where it is. */
function blocks(css: string): string[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
    (m) => `${(m[1] ?? "").trim()} { ${(m[2] ?? "").trim()} }`,
  );
}

describe("W-858: Kumo design rules in EmVB's editor CSS", () => {
  for (const [name, css] of Object.entries(SHEETS)) {
    test(`${name}: no bold above 600, no uppercase, no changed tracking`, () => {
      const bad = blocks(css).filter(
        (b) =>
          /font-weight:\s*(700|800|900|bold)/.test(b) ||
          /text-transform:\s*uppercase/.test(b) ||
          /letter-spacing:\s*(?!0[;\s}]|normal)/.test(b),
      );
      expect(bad).toEqual([]);
    });

    test(`${name}: hover colours change at once (no colour transitions)`, () => {
      const bad = blocks(css).filter((b) =>
        /transition:[^;}]*\b(background-color|background|color|border-color)\b/.test(b),
      );
      expect(bad).toEqual([]);
    });
  }
});
