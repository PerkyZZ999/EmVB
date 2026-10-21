import { describe, expect, test } from "bun:test";
import { defaultTriggers } from "./triggers.ts";
import { POPUP_CHROME_CSS, wrapPopupMarkup } from "./popup-markup.ts";

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

describe("popup and float chrome in the site's language (W-690)", () => {
  test("the dialog and close button take the set names, escaped", () => {
    const html = wrapPopupMarkup("p", "<p>x</p>", defaultTriggers(), {
      popup: "Fenêtre",
      close: 'Fermer "x"',
    });
    expect(html).toContain('aria-modal="true" aria-label="Fenêtre"');
    expect(html).toContain('aria-label="Fermer &quot;x&quot;"');
  });

  test("a float's close button takes the set name; unset stays Close", async () => {
    const { wrapFloatMarkup, defaultFloatSettings } = await import("./float.ts");
    const settings = { ...defaultFloatSettings(), dismiss: true };
    expect(wrapFloatMarkup("f", "Promo", "<p>x</p>", settings, true, "Fermer")).toContain(
      'aria-label="Fermer"',
    );
    expect(wrapFloatMarkup("f", "Promo", "<p>x</p>", settings)).toContain('aria-label="Close"');
  });
});

test("a long close name keeps whole characters (W-700)", () => {
  const html = wrapPopupMarkup("p", "", defaultTriggers(), { close: `${"x".repeat(79)}😀` });
  expect(html).toContain(`aria-label="${"x".repeat(79)}"`);
});

test("W-758: the close button stays at the top of a long popup and doesn't cover the heading", () => {
  const rule = /\.emvb-popup__close\{([^}]*)\}/.exec(POPUP_CHROME_CSS)?.[1] ?? "";
  expect(rule).toContain("position:sticky");
  expect(rule).toContain("top:-1rem");
  expect(rule).toContain("float:right");
  expect(rule).not.toContain("position:absolute");
});
