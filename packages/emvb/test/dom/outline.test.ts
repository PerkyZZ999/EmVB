import { expect, test } from "bun:test";
import { outline } from "./outline.ts";

// W-1009: the same EmVB markup reads the same under Kumo 2.6 (EmDash 1.4) and 2.15 (EmDash 1.5).
const host = (html: string) => {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
};

test("Kumo's classes, wrappers, internal attributes, extra controls and generated ids are left out", () => {
  const kumo26 = host(
    '<div class="flex gap-2"><button class="kumo-x emvb-btn" id="base-ui-r1" type="button" aria-disabled="false" data-kumo-part="trigger" data-state="open">Save</button></div><input aria-hidden="true" tabindex="-1" type="checkbox"><div role="tablist" data-orientation="horizontal"><button role="tab" aria-selected="true">A</button></div>',
  );
  const kumo215 = host(
    '<span id="_r_3_"><button data-state="open" type="button" class="emvb-btn other" data-activation-direction="left">Save</button></span><input aria-hidden="true" tabindex="-1" type="checkbox" id="base-ui-r9"><div role="tablist"><button data-kumo-part="overflow-control" aria-label="Scroll tabs left"></button><button aria-selected="true" role="tab" data-dirty="">A</button></div>',
  );
  expect(outline(kumo26)).toBe(outline(kumo215));
  expect(outline(kumo26)).toBe(
    [
      'button.emvb-btn data-state="open" type="button"',
      '  "Save"',
      'div role="tablist"',
      '  button aria-selected="true" role="tab"',
      '    "A"',
    ].join("\n"),
  );
});

test("EmVB's own markup stays: emvb- classes, data-emvb, roles, ids it sets, references", () => {
  const out = outline(
    host(
      '<section class="emvb-panel x" data-emvb-panel="style" id="hero" aria-labelledby="base-ui-r2"><span class="emvb-chip">Local</span></section>',
    ),
  );
  expect(out).toBe(
    [
      'section.emvb-panel aria-labelledby="(generated)" data-emvb-panel="style" id="hero"',
      "  span.emvb-chip",
      '    "Local"',
    ].join("\n"),
  );
});
