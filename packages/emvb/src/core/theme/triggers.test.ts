import { describe, expect, test } from "bun:test";
import { deviceForWidth, matchesPopupDevices, withinShowTimes } from "./popup-rules.ts";
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
