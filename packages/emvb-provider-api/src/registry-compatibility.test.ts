import { describe, expect, test } from "bun:test";
import { registerComponentProvider } from "./registry.ts";
import type { ComponentProvider } from "./types.ts";
const provider = (api: number): ComponentProvider => ({
  id: "future-kit",
  label: "Future Kit",
  version: "1.0.0",
  providerApiVersion: api as 1,
  nodeVersion: 1,
  nodeType: "provider",
  components: new Map(),
  createNode() {
    throw 0;
  },
  render() {
    return { tag: "div", attrs: {}, children: [] };
  },
  cssEntryPoints: [],
});
describe("registry compatibility gate", () => {
  test("rejects providers built for another API", () =>
    expect(() => registerComponentProvider(provider(2))).toThrow("requires Provider API 2"));
  test("registers a compatible provider", () => {
    const dispose = registerComponentProvider(provider(1));
    dispose();
  });
});
