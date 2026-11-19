import { describe, expect, test } from "bun:test";
import { providerHealthInventory } from "./health.ts";
import type { ComponentProvider, ProviderComponentNode } from "./types.ts";
const provider: ComponentProvider = {
  id: "kit",
  label: "Kit",
  version: "1.2.3",
  providerApiVersion: 1,
  nodeVersion: 1,
  nodeType: "provider",
  components: new Map([["button", {} as never]]),
  recipes: [{ id: "hero", name: "Hero", description: "", category: "Page", create: () => [] }],
  createNode() {
    throw 0;
  },
  render() {
    return { tag: "div", attrs: {}, children: [] };
  },
  cssEntryPoints: ["kit.css"],
  runtimeEntryPoints: ["kit.js"],
};
describe("provider health inventory", () => {
  test("reports package capabilities and usage", () => {
    const nodes = [
      { id: "x", type: "provider", provider: "kit", component: "button", props: {} },
    ] as Array<ProviderComponentNode & { provider: string }>;
    expect(providerHealthInventory(nodes, [provider])[0]).toMatchObject({
      id: "kit",
      version: "1.2.3",
      components: 1,
      recipes: 1,
      styles: 1,
      runtimes: 1,
      nodesInUse: 1,
      status: "ok",
    });
  });
});
