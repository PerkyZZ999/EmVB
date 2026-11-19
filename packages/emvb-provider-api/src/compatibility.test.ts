import { describe, expect, test } from "bun:test";
import {
  PROVIDER_API_VERSION,
  providerCompatibility,
  providerNodeDiagnostics,
} from "./compatibility.ts";
import type { ComponentProvider, ProviderComponentNode } from "./types.ts";
const provider = (api = PROVIDER_API_VERSION): ComponentProvider => ({
  id: "kit",
  label: "Kit",
  version: "2.1.0",
  providerApiVersion: api as 1,
  nodeVersion: 2,
  nodeType: "provider",
  components: new Map([
    [
      "button",
      {
        descriptor: {
          type: "provider",
          provider: "kit",
          component: "button",
          name: "Button",
          group: "content",
          defaultTab: "content",
          fields: [],
        },
        defaults: () => ({ type: "provider", component: "button", props: {} }),
        build: () => ({ tag: "button", attrs: {}, children: [] }),
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
const node = (
  providerId: string,
  component: string,
  version = 1,
  children: ProviderComponentNode[] = [],
): ProviderComponentNode & { provider: string } => ({
  id: `${providerId}-${component}`,
  type: "provider",
  provider: providerId,
  component,
  providerVersion: version,
  props: {},
  children,
});
describe("provider compatibility diagnostics", () => {
  test("accepts the current API", () => expect(providerCompatibility(provider())).toEqual([]));
  test("reports incompatible API versions", () =>
    expect(providerCompatibility(provider(2))[0]?.code).toBe("api-version-mismatch"));
  test("preserves and diagnoses missing providers and components recursively", () => {
    const found = providerNodeDiagnostics(
      [node("missing", "card", 1, [node("kit", "unknown")])],
      [provider()],
    );
    expect(found.map((x) => x.code)).toEqual(["missing-provider", "missing-component"]);
    expect(found[0]?.message).toContain("preserved");
  });
  test("warns when stored node data is newer", () =>
    expect(providerNodeDiagnostics([node("kit", "button", 3)], [provider()])[0]?.code).toBe(
      "node-version-newer",
    ));
  test("qualifies provider versions and recipe ids", () => {
    const broken = {
      ...provider(),
      version: "latest",
      recipes: [
        { id: "hero", name: "Hero", description: "", category: "Page", create: () => [] },
        { id: "hero", name: "Again", description: "", category: "Page", create: () => [] },
      ],
    } as ComponentProvider;
    expect(providerCompatibility(broken).map((x) => x.code)).toEqual([
      "invalid-provider-version",
      "duplicate-recipe",
    ]);
  });
});
