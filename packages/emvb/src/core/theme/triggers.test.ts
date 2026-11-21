import { describe, expect, test } from "bun:test";
import {
  deviceForWidth,
  matchesPopupDevices,
  matchesUrlParams,
  withinShowDates,
  withinShowTimes,
} from "./popup-rules.ts";
import { defaultTriggers, isSafeClickSelector, validateTriggers } from "./triggers.ts";

describe("validateTriggers", () => {
  test("accepts default page_load triggers", () => {
    const result = validateTriggers(defaultTriggers());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.triggers.open).toEqual([{ type: "page_load" }]);
    }
  });

  test("accepts delay, scroll, and click triggers", () => {
    const result = validateTriggers({
      schemaVersion: 1,
      open: [
        { type: "delay", ms: 2500 },
        { type: "scroll", percent: 50 },
        { type: "click", selector: ".open-promo, #cta" },
      ],
      advanced: { showTimes: 2, devices: ["desktop", "tablet"] },
    });
    expect(result.ok).toBe(true);
  });

  test("accepts exit_intent and inactivity triggers (W-081)", () => {
    const result = validateTriggers({
      schemaVersion: 1,
      open: [{ type: "exit_intent" }, { type: "inactivity", ms: 15_000 }],
      advanced: {},
    });
    expect(result.ok).toBe(true);
  });

  test("rejects inactivity below 1000ms", () => {
    const result = validateTriggers({
      schemaVersion: 1,
      open: [{ type: "inactivity", ms: 50 }],
      advanced: {},
    });
    expect(result.ok).toBe(false);
  });

  test("rejects empty open list", () => {
    const result = validateTriggers({ schemaVersion: 1, open: [], advanced: {} });
    expect(result.ok).toBe(false);
  });

  test("rejects unsafe click selectors", () => {
    const result = validateTriggers({
      schemaVersion: 1,
      open: [{ type: "click", selector: '<img onerror="alert(1)">' }],
      advanced: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.code).toBe("unsafe_selector");
    }
  });

  test("rejects delay above max", () => {
    const result = validateTriggers({
      schemaVersion: 1,
      open: [{ type: "delay", ms: 999_999 }],
      advanced: {},
    });
    expect(result.ok).toBe(false);
  });

  test("parses JSON strings", () => {
    const result = validateTriggers(JSON.stringify(defaultTriggers()));
    expect(result.ok).toBe(true);
  });
});

describe("isSafeClickSelector", () => {
  test("allows common selectors", () => {
    expect(isSafeClickSelector(".btn")).toBe(true);
    expect(isSafeClickSelector("#promo-open")).toBe(true);
    expect(isSafeClickSelector('a[href="/contact"]')).toBe(true);
  });

  test("allows the child combinator, which the popup config attribute escapes (W-613)", () => {
    expect(isSafeClickSelector("nav > .cta")).toBe(true);
    expect(isSafeClickSelector(".menu>a[href='/promo']")).toBe(true);
    expect(isSafeClickSelector("<b>")).toBe(false);
  });

  test("blocks angle brackets and javascript", () => {
    expect(isSafeClickSelector("<script>")).toBe(false);
    expect(isSafeClickSelector("javascript:alert(1)")).toBe(false);
  });
});

describe("device and show-times helpers", () => {
  test("deviceForWidth maps breakpoints", () => {
    expect(deviceForWidth(375)).toBe("mobile");
    expect(deviceForWidth(800)).toBe("tablet");
    expect(deviceForWidth(1280)).toBe("desktop");
  });

  test("matchesPopupDevices treats empty as all", () => {
    expect(matchesPopupDevices({}, 1280)).toBe(true);
    expect(matchesPopupDevices({ devices: null }, 375)).toBe(true);
    expect(matchesPopupDevices({ devices: ["mobile"] }, 375)).toBe(true);
    expect(matchesPopupDevices({ devices: ["mobile"] }, 1280)).toBe(false);
  });

  test("withinShowTimes respects limit", () => {
    expect(withinShowTimes({}, 99)).toBe(true);
    expect(withinShowTimes({ showTimes: 1 }, 0)).toBe(true);
    expect(withinShowTimes({ showTimes: 1 }, 1)).toBe(false);
  });
});

describe("URL rules and show dates (W-1081)", () => {
  const withAdvanced = (advanced: unknown) =>
    validateTriggers({ schemaVersion: 1, open: [{ type: "page_load" }], advanced });

  test("rules on the page address and a start and end are accepted", () => {
    expect(
      withAdvanced({
        urlParams: [
          { name: "utm_source", value: "newsletter" },
          { name: "coupon" },
          { name: "preview", absent: true },
        ],
        from: "2026-12-01T09:00-05:00",
        until: "2026-12-24T00:00Z",
      }).ok,
    ).toBe(true);
  });

  test("bad names, too many rules, bad dates and an end before the start are refused", () => {
    expect(withAdvanced({ urlParams: [{ name: "a b" }] }).ok).toBe(false);
    expect(withAdvanced({ urlParams: Array.from({ length: 6 }, () => ({ name: "x" })) }).ok).toBe(
      false,
    );
    expect(withAdvanced({ from: "2026-12-01" }).ok).toBe(false);
    expect(withAdvanced({ from: "2026-02-30T09:00Z" }).ok).toBe(false);
    expect(withAdvanced({ from: "2026-12-02T00:00Z", until: "2026-12-01T00:00Z" }).ok).toBe(false);
  });

  test("every rule must hold; a value, any value, or not there", () => {
    const rules = {
      urlParams: [
        { name: "utm_source", value: "news" },
        { name: "x", absent: true as const },
      ],
    };
    expect(matchesUrlParams(rules, "?utm_source=news")).toBe(true);
    expect(matchesUrlParams(rules, "?utm_source=news&x=1")).toBe(false);
    expect(matchesUrlParams(rules, "?utm_source=ads")).toBe(false);
    expect(matchesUrlParams({ urlParams: [{ name: "coupon" }] }, "?coupon=")).toBe(true);
    expect(matchesUrlParams({ urlParams: [{ name: "coupon" }] }, "")).toBe(false);
    expect(matchesUrlParams({ urlParams: null }, "")).toBe(true);
    expect(matchesUrlParams(undefined, "?a=1")).toBe(true);
  });

  test("shown from the start up to the end, not at it", () => {
    const dates = { from: "2026-12-01T00:00Z", until: "2026-12-02T00:00Z" };
    expect(withinShowDates(dates, Date.parse("2026-11-30T23:59:59Z"))).toBe(false);
    expect(withinShowDates(dates, Date.parse("2026-12-01T00:00Z"))).toBe(true);
    expect(withinShowDates(dates, Date.parse("2026-12-02T00:00Z"))).toBe(false);
    expect(withinShowDates({ until: null }, 0)).toBe(true);
  });

  test("an end at the start, or before it in another offset, is refused and never shows", () => {
    const same = { from: "2026-12-01T09:00Z", until: "2026-12-01T09:00Z" };
    // 09:00 at UTC-5 is 14:00 UTC, after 10:00 UTC though it reads earlier.
    const offset = { from: "2026-12-01T09:00-05:00", until: "2026-12-01T10:00Z" };
    for (const dates of [same, offset]) {
      expect(withAdvanced(dates).ok).toBe(false);
      for (const at of ["2026-11-30T00:00Z", "2026-12-01T09:00Z", "2026-12-01T12:00Z"]) {
        expect(withinShowDates(dates, Date.parse(at))).toBe(false);
      }
    }
    expect(withAdvanced({ from: "2026-12-01T09:00-05:00", until: "2026-12-01T15:00Z" }).ok).toBe(
      true,
    );
  });
});
