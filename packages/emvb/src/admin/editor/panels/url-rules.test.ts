import { describe, expect, test } from "bun:test";
import { formatUrlRules, parseUrlRules } from "./url-rules.ts";

describe("popup URL rules as lines (W-1081)", () => {
  test("a value, any value and not there read and write back", () => {
    const parsed = parseUrlRules(" utm_source=newsletter \n\ncoupon\n!preview\n!lang=fr");
    expect(parsed).toEqual({
      ok: true,
      rules: [
        { name: "utm_source", value: "newsletter" },
        { name: "coupon" },
        { name: "preview", absent: true },
        { name: "lang", value: "fr", absent: true },
      ],
    });
    if (parsed.ok)
      expect(formatUrlRules(parsed.rules)).toBe(
        "utm_source=newsletter\ncoupon\n!preview\n!lang=fr",
      );
    expect(parseUrlRules("")).toEqual({ ok: true, rules: [] });
  });

  test("a line that isn't a rule, or six rules, say why", () => {
    const bad = parseUrlRules("utm source=x");
    expect(bad.ok ? "" : bad.message).toContain('"utm source=x" isn\'t a rule');
    const many = parseUrlRules("a\nb\nc\nd\ne\nf");
    expect(many.ok ? "" : many.message).toBe("Use at most 5 rules.");
  });
});
