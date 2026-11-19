import { afterAll, afterEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { registerComponentProvider, type ComponentProvider } from "@perkyzz/emvb-provider-api";
import { AddPanel } from "./AddPanel.tsx";

// A fixture provider with two section recipes: the palette shows and searches any provider's.
const PROVIDER = "fixture-kit";
const kit: ComponentProvider = {
  id: PROVIDER,
  label: "Fixture kit",
  nodeType: "provider",
  components: new Map(),
  recipes: [
    {
      id: "pricing",
      name: "Pricing section",
      description: "Three plans with a call to action.",
      category: "Marketing",
      create: () => [],
    },
    {
      id: "stats",
      name: "Key figures",
      description: "Three numbers that show results.",
      category: "Marketing",
      create: () => [],
    },
  ],
  createNode(component, id) {
    return { id, type: "provider", provider: PROVIDER, component, props: {} };
  },
  render() {
    return { tag: "div", attrs: {}, children: [] };
  },
  cssEntryPoints: [],
};
const dispose = registerComponentProvider(kit);

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  document.body.textContent = "";
  root = undefined;
});
afterAll(() => dispose());

const mount = async (node: React.ReactNode) => {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(node));
};

describe("the Add panel offers a provider's section recipes", () => {
  test("shows and searches a provider's recipes", async () => {
    await mount(
      <AddPanel onAdd={() => undefined} onRecipe={() => undefined} defaultQuery="pricing" />,
    );
    const tile = document.querySelector<HTMLButtonElement>(
      `[data-emvb-recipe="provider:${PROVIDER}:pricing"]`,
    );
    expect(tile?.textContent).toContain("Pricing section");
    expect(tile?.textContent).toContain("Fixture kit");
  });

  test("passes a namespaced recipe identifier", async () => {
    const seen: string[] = [];
    await mount(
      <AddPanel
        onAdd={() => undefined}
        onRecipe={(id) => seen.push(id)}
        defaultQuery="key figures"
      />,
    );
    document
      .querySelector<HTMLButtonElement>(`[data-emvb-recipe="provider:${PROVIDER}:stats"]`)
      ?.click();
    expect(seen).toEqual([`provider:${PROVIDER}:stats`]);
  });
});
