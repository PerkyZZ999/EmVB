import { afterAll, afterEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import { componentProvider, registerComponentProvider } from "@perkyzz/emvb-provider-api";
import { emptyDesign, type LayoutNode } from "../../../../core/index.ts";
import { ProviderNode } from "../../../../core/schema/layout.ts";
import type { Fetcher } from "../../../api.ts";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { ElementPanel } from "../ElementPanel.tsx";

// A fixture provider with one component that has a number field and a date-time field. The
// editor's field controls are generic; the countdown's own labels belong to the provider that owns the component.
const PROVIDER = "fixture-timer";
const dispose = registerComponentProvider({
  id: PROVIDER,
  label: "Fixture timer",
  nodeType: "provider",
  components: new Map([
    [
      "timer",
      {
        descriptor: {
          type: "provider",
          provider: PROVIDER,
          component: "timer",
          name: "Timer",
          group: "content",
          defaultTab: "content",
          fields: [
            { key: "value", kind: "number", label: "Fixed number" },
            { key: "target", kind: "datetime", label: "Ends at" },
          ],
        },
        defaults: () => ({ type: "provider", provider: PROVIDER, component: "timer", props: {} }),
        build: () => ({ tag: "div", attrs: {}, children: [] }),
      },
    ],
  ]),
  createNode(component, id) {
    return { id, type: "provider", provider: PROVIDER, component, props: {} };
  },
  render() {
    return { tag: "div", attrs: {}, children: [] };
  },
  cssEntryPoints: [],
});

const stubFetcher: Fetcher = async () => new Response("{}", { status: 200 });
let nodes: LayoutNode[] = [];

afterEach(async () => {
  await cleanup();
  nodes = [];
});
afterAll(() => dispose());

function Harness({ start }: { start: LayoutNode }) {
  const [node, set] = React.useState(start);
  return (
    <ElementPanel
      node={node}
      layout={{
        schemaVersion: 18,
        root: { id: "root0001", type: "container", props: {}, children: [node] },
      }}
      design={emptyDesign()}
      rejection={null}
      fetcher={stubFetcher}
      device="desktop"
      onChange={(next) => {
        nodes.push(next);
        set(next);
      }}
      onDesignChange={async () => undefined}
      onSelect={() => undefined}
    />
  );
}

const timer = () => componentProvider(PROVIDER)?.createNode("timer", "tm000001") as LayoutNode;

async function type(field: string, text: string) {
  const input = document.querySelector<HTMLInputElement>(`[data-emvb-field="${field}"]`);
  if (!input) throw new Error(`No field ${field}`);
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.blur();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

describe("a provider's fields save what the editor can store", () => {
  test("typing a number keeps the page savable (it used to save { value, unit })", async () => {
    await mount(<Harness start={timer()} />);
    await type("value", "50");
    const saved = nodes.at(-1);
    expect(saved?.props).toMatchObject({ value: 50 });
    expect(ProviderNode.safeParse(saved).success).toBe(true);
  });

  test("a date-time field is a real date picker and saves a plain string", async () => {
    await mount(<Harness start={timer()} />);
    const input = document.querySelector<HTMLInputElement>('[data-emvb-field="target"]');
    expect(input?.type).toBe("datetime-local");
    await type("target", "2030-05-06T07:08");
    const saved = nodes.at(-1);
    expect(saved?.props).toMatchObject({ target: "2030-05-06T07:08" });
    expect(ProviderNode.safeParse(saved).success).toBe(true);
    await type("target", "");
    expect(nodes.at(-1)?.props).not.toHaveProperty("target");
    expect(ProviderNode.safeParse(nodes.at(-1)).success).toBe(true);
  });

  test("the field has no pixel unit in its label", async () => {
    await mount(<Harness start={timer()} />);
    const labels = [...document.querySelectorAll("label, span")].map((el) => el.textContent ?? "");
    expect(labels).toContain("Fixed number");
    expect(labels.filter((text) => text.includes("(px)"))).toEqual([]);
  });
});
