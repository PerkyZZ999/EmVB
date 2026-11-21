import { describe, expect, test } from "bun:test";
import { defaultTriggers, validateTriggers } from "./triggers.ts";
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

describe("off-canvas panels (W-1071)", () => {
  const triggers = (panel?: unknown) =>
    ({
      schemaVersion: 1,
      open: [{ type: "page_load" }],
      advanced: {},
      ...(panel ? { panel } : {}),
    }) as never;

  test("a panel is the same dialog with the edge and width as classes", () => {
    expect(wrapPopupMarkup("p1", "<p>x</p>", triggers({ edge: "right", size: "wide" }))).toContain(
      'class="emvb-popup emvb-popup--panel emvb-popup--right emvb-popup--wide"',
    );
    expect(wrapPopupMarkup("p1", "<p>x</p>", triggers({ edge: "left" }))).toContain(
      'class="emvb-popup emvb-popup--panel emvb-popup--left"',
    );
    const centred = wrapPopupMarkup("p1", "<p>x</p>", triggers());
    expect(centred).toContain('class="emvb-popup"');
    expect(centred).toContain('role="dialog" aria-modal="true"');
  });

  test("the chrome lays panels out at the edge and slides them in only without reduced motion", () => {
    expect(POPUP_CHROME_CSS).toContain(".emvb-popup--right{justify-content:flex-end}");
    expect(POPUP_CHROME_CSS).toContain(
      "@media (prefers-reduced-motion:no-preference){.emvb-popup--left .emvb-popup__dialog{animation:emvb-panel-left",
    );
  });

  test("a left panel stays at the left on a right-to-left site, a right one at the right", () => {
    // flex-start and flex-end follow the text direction; the slide-in comes from a physical edge.
    expect(POPUP_CHROME_CSS).toContain(".emvb-popup--left .emvb-popup__dialog{margin-right:auto}");
    expect(POPUP_CHROME_CSS).toContain(".emvb-popup--right .emvb-popup__dialog{margin-left:auto}");
  });

  test("triggers accept a panel edge and width, and refuse others", () => {
    const at = (panel: unknown) =>
      validateTriggers({ schemaVersion: 1, open: [{ type: "page_load" }], panel }).ok;
    expect([at({ edge: "left" }), at({ edge: "right", size: "narrow" })]).toEqual([true, true]);
    expect([at({ edge: "top" }), at({ edge: "left", size: "huge" }), at({})]).toEqual([
      false,
      false,
      false,
    ]);
  });
});
