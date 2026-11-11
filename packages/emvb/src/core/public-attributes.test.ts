import { describe, expect, test } from "bun:test";
import { editorAttributesIn } from "./public-attributes.ts";

describe("public data-emvb hooks (W-962)", () => {
  test("names an editor attribute on a tag, by exact name, and ignores CSS and scripts", () => {
    expect(
      editorAttributesIn(
        '<div data-emvb-theme-part="a" data-emvb-id="x"><i data-emvb-float-edge="b"></i></div>',
      ),
    ).toEqual(["data-emvb-id"]);
    // A prefix of an allowed name is not allowed.
    expect(editorAttributesIn('<div data-emvb-theme-part-x="1"></div>')).toEqual([
      "data-emvb-theme-part-x",
    ]);
    expect(editorAttributesIn('<li data-emvb-loop-item="p1" data-emvb-state="hover">')).toEqual([
      "data-emvb-state",
    ]);
    expect(
      editorAttributesIn(
        "<style>.m:not([data-emvb-menu-dismissed]){}</style><script>x('[data-emvb-id]')</script><p>ok</p>",
      ),
    ).toEqual([]);
  });
});
