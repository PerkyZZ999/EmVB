import { describe, expect, test } from "bun:test";
import { migrateProviderNode } from "./migrations.ts";
import type { ComponentProvider, ProviderComponentNode } from "./types.ts";
const provider: ComponentProvider = {
  id: "kit",
  label: "Kit",
  version: "2.0.0",
  providerApiVersion: 1,
  nodeVersion: 2,
  nodeType: "provider",
  components: new Map(),
  migrateNode(node, context) {
    return {
      ...node,
      props: { ...node.props, migrated: `${context.fromVersion}-${context.toVersion}` },
    };
  },
  createNode() {
    throw 0;
  },
  render() {
    return { tag: "div", attrs: {}, children: [] };
  },
  cssEntryPoints: [],
};
const node: ProviderComponentNode = {
  id: "root",
  type: "provider",
  component: "card",
  providerVersion: 1,
  props: { label: "Original" },
  children: [{ id: "child", type: "provider", component: "button", providerVersion: 1, props: {} }],
};
describe("provider migrations", () => {
  test("migrates immutable trees and stamps versions", () => {
    const before = structuredClone(node);
    const result = migrateProviderNode(node, provider);
    expect(result.migrated).toBe(true);
    expect(result.node.providerVersion).toBe(2);
    expect(result.node.children?.[0]?.providerVersion).toBe(2);
    expect(result.node.props.migrated).toBe("1-2");
    expect(node).toEqual(before);
  });
  test("is deterministic", () =>
    expect(migrateProviderNode(node, provider).node).toEqual(
      migrateProviderNode(node, provider).node,
    ));
  test("rejects downgrade and missing migration", () => {
    expect(() => migrateProviderNode({ ...node, providerVersion: 3 }, provider)).toThrow(
      "Cannot downgrade",
    );
    expect(() => migrateProviderNode(node, { ...provider, migrateNode: undefined })).toThrow(
      "cannot migrate",
    );
  });
  test("rejects identity changes", () =>
    expect(() =>
      migrateProviderNode(node, { ...provider, migrateNode: (n) => ({ ...n, id: "changed" }) }),
    ).toThrow("changed node id"));
});
