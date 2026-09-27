import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { emptyDesign, type LayoutNode } from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { ElementPanel } from "../ElementPanel.tsx";

const stubFetcher: Fetcher = async () => new Response("{}", { status: 200 });

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  host?.remove();
  host = undefined;
  document.body.innerHTML = "";
  sessionStorage.clear();
});

async function mount(node: React.ReactNode) {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(node));
}

const design = {
  ...emptyDesign(),
  classes: [
    { id: "card", name: "Card", style: { paddingTop: { value: 8, unit: "px" as const } } },
    { id: "accent", name: "Accent", style: { color: "#ff0000" } },
  ],
};

const layout = {
  schemaVersion: 1 as const,
  root: {
    id: "root0001",
    type: "container" as const,
    props: {},
    children: [
      {
        id: "head0001",
        type: "heading" as const,
        props: { text: "Hi", level: 1 as const },
      },
    ],
  },
};

async function openStyleTab() {
  const styleTab = [...document.querySelectorAll('[role="tab"]')].find(
    (t) => t.textContent === "Style",
  ) as HTMLElement | undefined;
  expect(styleTab).toBeTruthy();
  await act(async () => styleTab?.click());
}

describe("ClassPicker (W-031)", () => {
  test("apply two classes, reorder, and persist deep-equal list", async () => {
    let current: LayoutNode = {
      id: "head0001",
      type: "heading",
      props: { text: "Hi", level: 1 },
      classes: ["card", "accent"],
    };

    const panel = () => (
      <ElementPanel
        node={current}
        layout={layout}
        design={design}
        rejection={null}
        fetcher={stubFetcher}
        onChange={(node) => {
          current = node;
        }}
        onDesignChange={async () => undefined}
        onSelect={() => undefined}
      />
    );

    await mount(panel());
    await openStyleTab();
    expect(document.querySelector("[data-emvb-cascade-caption]")?.textContent).toMatch(/cascade/i);
    expect(
      [...document.querySelectorAll("[data-emvb-class-id]")].map((el) =>
        el.getAttribute("data-emvb-class-id"),
      ),
    ).toEqual(["card", "accent"]);

    const moveUpAccent = document.querySelector(
      '[data-emvb-class-id="accent"] button[aria-label="Move Accent up"]',
    ) as HTMLButtonElement | null;
    expect(moveUpAccent).toBeTruthy();
    await act(async () => moveUpAccent?.click());
    expect(current.classes).toEqual(["accent", "card"]);

    // Remount as if the page reloaded with the saved classes.
    await mount(panel());
    await openStyleTab();
    expect(
      [...document.querySelectorAll("[data-emvb-class-id]")].map((el) =>
        el.getAttribute("data-emvb-class-id"),
      ),
    ).toEqual(["accent", "card"]);
    expect(current.classes).toEqual(["accent", "card"]);
  });
});
