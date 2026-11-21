import { describe, expect, mock, test } from "bun:test";
import { failOnActWarnings, holdsDomNode, takeActWarnings } from "./happydom.ts";

test("the happy-dom preload provides a DOM at the plugin admin URL", () => {
  const el = document.createElement("div");
  el.dataset["probe"] = "1";
  document.body.append(el);
  expect(document.querySelector("[data-probe='1']") === el).toBe(true);
  expect(window.location.pathname).toBe("/_emdash/admin/plugins/emvb/pages");
});

/** The message a failing assertion throws, or "passed". */
function failure(assert: () => void): string {
  try {
    assert();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "passed";
}

// Detached elements keep these cheap if the guard breaks: about 1 MB per message, not gigabytes.
describe("failing assertions on DOM nodes print small (2026-09-30 out-of-memory)", () => {
  test("toBeNull, toBeUndefined, toBeFalsy and toBe print a node as its markup, cut short", () => {
    const el = document.createElement("span");
    el.id = "probe";
    const long = document.createElement("p");
    long.textContent = "x".repeat(5000);
    const messages = [
      failure(() => expect(el).toBeNull()),
      failure(() => expect(el).toBeUndefined()),
      failure(() => expect(el).toBeFalsy()),
      failure(() => expect(el).toBe(document.createElement("span"))),
      failure(() => expect(long).toBeNull()),
    ];
    expect(messages.map((message) => message.length < 1000)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(messages.slice(0, 4).map((m) => m.includes('<span id="probe"></span>'))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(messages[4]).toContain("<p>xxx");
    expect(messages[4]).toContain("x…");
  });

  test("the diff matchers refuse nodes, also inside arrays, objects, maps and mock calls", () => {
    const el = document.createElement("span");
    const called = mock();
    called(el);
    const messages = [
      failure(() => expect<unknown>(el).toEqual(null)),
      failure(() => expect<unknown>(null).toEqual(el)),
      failure(() => expect(el).not.toEqual(1)),
      failure(() => expect([el]).toStrictEqual([])),
      failure(() => expect({ a: { b: el } }).toMatchObject({ a: 1 })),
      failure(() => expect(new Map([["k", el]])).toEqual(new Map())),
      failure(() => expect({ el }).toHaveProperty("el", 1)),
      failure(() => expect(called).toHaveBeenCalledWith(1)),
      failure(() => expect(called).toHaveBeenLastCalledWith(1)),
      failure(() => expect(called).toHaveBeenNthCalledWith(1, 1)),
    ];
    expect(messages.map((m) => m.length < 1000 && m.includes("refuses DOM nodes"))).toEqual(
      messages.map(() => true),
    );
    expect(holdsDomNode(window)).toBe(true);
    expect(holdsDomNode({ list: [1, "a", { deep: null }], when: new Date(0) })).toBe(false);
  });

  test("the diff matchers still compare plain values as before", async () => {
    expect({ a: [1], b: "xy" }).toEqual({ a: [1], b: expect.stringContaining("x") });
    expect({ a: 1 }).not.toEqual({ a: 2 });
    expect({ a: 1, b: 2 }).toMatchObject({ a: 1 });
    expect({ a: { b: 1 } }).toHaveProperty("a.b");
    expect({ a: { b: 1 } }).toHaveProperty("a.b", 1);
    await expect(Promise.resolve([1])).resolves.toStrictEqual([1]);
    const called = mock();
    called(1, "x");
    called(2);
    expect(called).toHaveBeenCalledWith(1, "x");
    expect(called).not.toHaveBeenCalledWith(3);
    expect(called).toHaveBeenLastCalledWith(2);
    expect(called).toHaveBeenNthCalledWith(1, 1, "x");
    const diff = failure(() => expect({ a: [1] }).toEqual({ a: [2] }));
    expect(diff).toContain("- Expected  - 1");
    expect(failure(() => expect({ a: 1 }).not.toEqual({ a: 1 }))).toContain("Expected: not");
  });
});

// oxlint-disable no-console -- these tests call the console.warn the preload wraps.
describe("Kumo's unnamed-field warning fails the test (W-1061)", () => {
  test("the warning throws where the field renders; other warnings only print", () => {
    const kumo =
      "[Kumo Input]: Input must have an accessible name. Provide either:\n  - label prop";
    expect(failure(() => console.warn(kumo))).toBe(
      "[Kumo Input]: Input must have an accessible name. Provide either:",
    );
    const before = console.warn;
    expect(failure(() => console.warn("[Kumo Input]: variant is deprecated"))).toBe("passed");
    expect(console.warn === before).toBe(true);
  });
});

// oxlint-disable no-console -- these tests call the console.error the preload wraps.
describe("React act() warnings fail the test (W-1061)", () => {
  test("an act() warning is noted for the end of the test; other errors only print", () => {
    console.error(
      "An update to %s inside a test was not wrapped in act(...).\n\nWhen testing, code that causes React state updates should be wrapped into act(...):",
      "Panel",
    );
    console.error("Something else went wrong");
    // Taken here so this test's own end passes; the preload's afterEach throws on any left.
    expect(takeActWarnings()).toEqual([
      "An update to Panel inside a test was not wrapped in act(...)",
    ]);
    expect(takeActWarnings()).toEqual([]);
  });

  test("the check after each test throws on a noted warning, naming the component", () => {
    console.error("An update to %s inside a test was not wrapped in act(...).", "Toast");
    expect(failure(() => failOnActWarnings())).toStartWith(
      "React act() warning (W-1061): An update to Toast inside a test was not wrapped in act(...).",
    );
    expect(failure(() => failOnActWarnings())).toBe("passed");
  });
});
