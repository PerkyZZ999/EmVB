import { afterEach, describe, expect, test } from "bun:test";
import { registerComponentProvider, type ComponentProvider } from "@perkyzz/emvb-provider-api";
import type { ProviderNode } from "../../../core/index.ts";
import { newElement } from "./new-element.ts";
const provider = (id: string, component: string): ComponentProvider => ({
  id,
  label: id,
  nodeType: "provider",
  components: new Map([
    [
      component,
      {
        descriptor: {
          type: "provider",
          provider: id,
          component,
          name: component,
          group: "content",
          defaultTab: "content",
          fields: [],
        },
        defaults: () => ({ type: "provider", component, props: { label: id } }),
        build: () => ({ tag: "div", attrs: {}, children: [] }),
      },
    ],
  ]),
  createNode(name, nodeId) {
    return { id: nodeId, type: "provider", component: name, props: { label: id } };
  },
  render() {
    return { tag: "div", attrs: {}, children: [] };
  },
  cssEntryPoints: [],
});
describe("generic provider node creation", () => {
  const dispose: Array<() => void> = [];
  afterEach(() => {
    for (const fn of dispose.splice(0)) fn();
  });
  test("creates nodes from two unrelated registered providers", () => {
    dispose.push(registerComponentProvider(provider("alpha-kit", "button")));
    dispose.push(registerComponentProvider(provider("beta-kit", "card")));
    expect(
      (newElement("provider:alpha-kit:button", () => 0) as ProviderNode | null)?.props.label,
    ).toBe("alpha-kit");
    expect(
      (newElement("provider:beta-kit:card", () => 0) as ProviderNode | null)?.props.label,
    ).toBe("beta-kit");
  });
  test("rejects unknown and malformed provider identifiers", () => {
    expect(newElement("provider:missing:button", () => 0)).toBeNull();
    expect(newElement("provider:bad", () => 0)).toBeNull();
  });
});
