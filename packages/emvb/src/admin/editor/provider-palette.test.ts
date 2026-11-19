import { describe, expect, test } from "bun:test";
import type { ComponentProvider } from "@perkyzz/emvb-provider-api";
import { providerPaletteDescriptors, providerPaletteGroups } from "./provider-palette.ts";
const provider = (
  id: string,
  label: string,
  component: string,
  category: string,
  support?: "verified" | "experimental",
): ComponentProvider => ({
  id,
  label,
  nodeType: "provider",
  components: new Map([
    [
      component,
      {
        descriptor: {
          type: "provider",
          provider: id,
          component,
          name: `${label} component`,
          group: "content",
          defaultTab: "content",
          category,
          support,
          fields: [],
        },
        defaults: () => ({ type: "provider", component, props: {} }),
        build: () => ({ tag: "div", attrs: {}, children: [] }),
      },
    ],
  ]),
  createNode() {
    throw 0;
  },
  render() {
    return { tag: "div", attrs: {}, children: [] };
  },
  cssEntryPoints: [],
});
describe("generic provider palette", () => {
  test("groups unrelated providers using provider labels and categories", () => {
    const descriptors = providerPaletteDescriptors([
      provider("alpha-kit", "Alpha Kit", "button", "Actions"),
      provider("beta-kit", "Beta Kit", "card", "Layout"),
    ]);
    expect(providerPaletteGroups(descriptors)).toEqual([
      { id: "provider:alpha-kit:Actions", label: "Alpha Kit · Actions" },
      { id: "provider:beta-kit:Layout", label: "Beta Kit · Layout" },
    ]);
    expect(descriptors.map((item) => item.type)).toEqual([
      "provider:alpha-kit:button",
      "provider:beta-kit:card",
    ]);
  });
  test("orders verified components before experimental components", () => {
    const descriptors = providerPaletteDescriptors([
      provider("alpha-kit", "Alpha Kit", "draft", "Actions", "experimental"),
      provider("beta-kit", "Beta Kit", "stable", "Actions", "verified"),
    ]);
    expect(descriptors.map((item) => item.type)).toEqual([
      "provider:beta-kit:stable",
      "provider:alpha-kit:draft",
    ]);
    expect(descriptors[1]?.name).toContain("experimental");
  });
});
