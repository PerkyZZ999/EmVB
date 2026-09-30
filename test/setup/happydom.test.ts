import { describe, expect, mock, test } from "bun:test";
import { holdsDomNode } from "./happydom.ts";

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
