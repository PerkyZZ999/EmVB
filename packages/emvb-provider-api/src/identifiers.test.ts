import { describe, expect, test } from "bun:test";
import { formatProviderComponentId, parseProviderComponentId } from "./identifiers.ts";
describe("provider component identifiers", () => {
  test("round trips a generic provider and component", () => {
    const id = formatProviderComponentId("fixture-one", "button");
    expect(id).toBe("provider:fixture-one:button");
    expect(parseProviderComponentId(id)).toEqual({
      providerId: "fixture-one",
      componentId: "button",
    });
  });
  test("rejects malformed and ambiguous identifiers", () => {
    for (const id of [
      "provider:",
      "provider:a",
      "provider:A:button",
      "provider:a:b:c",
      "native:button",
    ])
      expect(parseProviderComponentId(id)).toBeUndefined();
    expect(() => formatProviderComponentId("bad:id", "button")).toThrow();
  });
});
