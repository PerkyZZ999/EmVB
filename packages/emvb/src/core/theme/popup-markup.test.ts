import { describe, expect, test } from "bun:test";
import { defaultTriggers } from "./triggers.ts";
import { wrapPopupMarkup } from "./popup-markup.ts";

describe("wrapPopupMarkup", () => {
  test("embeds escaped config and dialog chrome", () => {
    const html = wrapPopupMarkup('abc"id', "<p>Hello</p>", defaultTriggers());
    expect(html).toContain('data-emvb-popup="abc&quot;id"');
    expect(html).toContain("data-emvb-popup-config=");
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("data-emvb-popup-dismiss");
    expect(html).toContain("<p>Hello</p>");
    expect(html).toContain("hidden");
    expect(html).not.toContain('data-emvb-popup="abc"id"');
  });

  test("W-282: the dialog is named Popup, not by its whole content", () => {
    const html = wrapPopupMarkup("p", "<h2>Join</h2><p>Long text</p>", defaultTriggers());
    expect(html).toContain('role="dialog" aria-modal="true" aria-label="Popup"');
    expect(html).not.toContain("aria-labelledby");
  });
});
