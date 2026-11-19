import { describe, expect, test } from "bun:test";
import { providerAssetEntries, providerStyleEntries } from "./assets.ts";
import type { ComponentProvider, ProviderComponentNode } from "./types.ts";

const provider = {
  version: "1.0.0",
  providerApiVersion: 1,
  nodeVersion: 1,
  id: "example-kit",
  label: "Example kit",
  nodeType: "provider",
  components: new Map(),
  createNode() {
    throw new Error("unused");
  },
  render() {
    return { tag: "div", attrs: {}, children: [] };
  },
  cssEntryPoints: ["kit.css"],
  runtimeEntryPoints: ["kit-runtime"],
  needsRuntime(node) {
    return node.component === "modal" || node.component === "tabs";
  },
} satisfies ComponentProvider;

const node = (
  component: string,
  children: ProviderComponentNode[] = [],
): ProviderComponentNode & { provider: string } => ({
  id: `${component}-x`,
  type: "provider",
  provider: "example-kit",
  component,
  props: {},
  children,
});

describe("generic conditional provider assets", () => {
  test("returns no assets when no provider node exists", () =>
    expect(providerAssetEntries([], [provider])).toEqual({ styles: [], runtimes: [] }));

  test("loads CSS for static provider components without runtime", () =>
    expect(providerAssetEntries([node("button")], [provider])).toEqual({
      styles: ["kit.css"],
      runtimes: [],
    }));

  test("loads and deduplicates runtime for nested interactive components", () =>
    expect(providerAssetEntries([node("card", [node("modal"), node("tabs")])], [provider])).toEqual(
      { styles: ["kit.css"], runtimes: ["kit-runtime"] },
    ));

  test("style helper remains conditional", () => {
    expect(providerStyleEntries([], [provider])).toEqual([]);
    expect(providerStyleEntries([node("button")], [provider])).toEqual(["kit.css"]);
  });
});
