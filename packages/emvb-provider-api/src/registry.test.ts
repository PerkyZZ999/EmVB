import { afterEach, describe, expect, test } from "bun:test";
import {
  clearComponentProvidersForTest,
  componentProvider,
  componentProviders,
  registerComponentProvider,
} from "./registry.ts";
import type { ComponentProvider } from "./types.ts";

const provider = (id = "example"): ComponentProvider => ({
  id,
  label: "Example",
  nodeType: "provider",
  components: new Map(),
  createNode() {
    throw new Error("unused");
  },
  render() {
    return { tag: "div", attrs: {}, children: [] };
  },
  cssEntryPoints: [],
});
afterEach(clearComponentProvidersForTest);

describe("component provider registry", () => {
  test("registers, enumerates and unregisters a provider", () => {
    const value = provider();
    const remove = registerComponentProvider(value);
    expect(componentProvider("example")).toBe(value);
    expect(componentProviders()).toEqual([value]);
    remove();
    expect(componentProvider("example")).toBeUndefined();
  });
  test("rejects invalid and conflicting provider ids", () => {
    expect(() => registerComponentProvider(provider("Bad ID"))).toThrow("Invalid");
    registerComponentProvider(provider());
    expect(() => registerComponentProvider(provider())).toThrow("already registered");
  });
});
