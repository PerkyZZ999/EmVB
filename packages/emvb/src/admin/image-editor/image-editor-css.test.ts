import { expect, test } from "bun:test";
import { IMAGE_EDITOR_CSS } from "./image-editor-css.ts";

test("W-872: the section tab list grows to its tabs, so the underline sits below the label", () => {
  const rule = /\.emvb-ie-tabs \[role="tablist"\] \{([^}]*)\}/.exec(IMAGE_EDITOR_CSS)?.[1] ?? "";
  expect(rule).toMatch(/(^|;)\s*height: auto;/);
});
