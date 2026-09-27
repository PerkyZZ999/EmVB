import { describe, expect, test } from "bun:test";
import { ELEMENT_DESCRIPTORS } from "../../../../core/index.ts";
import { STYLE_PROPERTY_MAP } from "../../../../core/sanitize/css.ts";
import { IMPLEMENTED_FIELD_KINDS } from "./FieldControl.tsx";
import { IMPLEMENTED_STYLE_KEYS } from "./StyleRow.tsx";
import { CONTROLLED_STYLE_KEYS, STYLE_UI, keysFor } from "./style-sections.ts";

describe("settings coverage (W-021)", () => {
  test("every descriptor field kind has a control", () => {
    const implemented = new Set<string>(IMPLEMENTED_FIELD_KINDS);
    for (const descriptor of ELEMENT_DESCRIPTORS) {
      for (const field of descriptor.fields) {
        expect(implemented.has(field.kind)).toBe(true);
      }
    }
  });

  test("every StyleProps key the panel shows has a StyleRow control", () => {
    const implemented = new Set(IMPLEMENTED_STYLE_KEYS);
    for (const key of CONTROLLED_STYLE_KEYS) {
      expect(implemented.has(key)).toBe(true);
    }
    for (const key of Object.keys(STYLE_PROPERTY_MAP)) {
      expect(implemented.has(key as never)).toBe(true);
    }
  });

  test("every element type in STYLE_UI only references known sections and keys", () => {
    for (const [type, ui] of Object.entries(STYLE_UI)) {
      expect(ui.sections.length).toBeGreaterThan(0);
      expect(ui.sections).toContain(ui.defaultOpen);
      for (const section of ui.sections) {
        if (section === "advanced") continue;
        for (const key of keysFor(type, section)) {
          expect(IMPLEMENTED_STYLE_KEYS.includes(key)).toBe(true);
        }
      }
    }
  });
});
