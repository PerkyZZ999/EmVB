import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { registerComponentProvider, type ComponentProvider } from "@perkyzz/emvb-provider-api";
import { ProviderMetaFields } from "./ProviderMetaFields.tsx";
import type { LayoutNode } from "../../../../core/index.ts";

let root: Root | undefined;
const dispose: Array<() => void> = [];

afterEach(() => {
  act(() => root?.unmount());
  document.body.textContent = "";
  root = undefined;
  for (const off of dispose.splice(0)) off();
});

// A fixture provider: the editor shows only the meta fields a provider declares.
const kit = (id: string, metaFields?: ComponentProvider["metaFields"]): ComponentProvider => ({
  id,
  label: id,
  nodeType: "provider",
  components: new Map(),
  metaFields,
  createNode(name, nodeId) {
    return { id: nodeId, type: "provider", component: name, props: {} };
  },
  render() {
    return { tag: "div", attrs: {}, children: [] };
  },
  cssEntryPoints: [],
});

const node = (provider: string): LayoutNode => ({
  id: "theme-node",
  type: "provider",
  provider,
  component: "button",
  props: { label: "Save" },
  providerMeta: { theme: "corporate" },
});

const render = async (layout: LayoutNode) => {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root?.render(<ProviderMetaFields node={layout} onChange={() => undefined} />),
  );
};

describe("WP15 provider meta fields", () => {
  test("shows the meta fields a provider declares", async () => {
    dispose.push(
      registerComponentProvider(
        kit("fixture-theme", [
          {
            key: "theme",
            kind: "select",
            label: "Theme",
            options: [{ value: "corporate", label: "Corporate" }],
          },
        ]),
      ),
    );
    await render(node("fixture-theme"));
    expect(document.querySelector('[data-emvb-provider-meta="fixture-theme"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Theme");
  });

  test("a provider without meta fields shows nothing", async () => {
    dispose.push(registerComponentProvider(kit("fixture-plain")));
    await render(node("fixture-plain"));
    expect(document.querySelector("[data-emvb-provider-meta]")).toBeNull();
  });
});
