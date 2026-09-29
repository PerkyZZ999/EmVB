import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DesignSystem, Layout, VariableKind } from "../../../core/index.ts";
import { ClassesSection } from "./ClassesSection.tsx";
import { VariableSection } from "./VariableSection.tsx";

// Snapshots were recorded from both sections before W-086 M5 shared their pieces.
let root: Root | undefined;
let host: HTMLElement;
let saved: DesignSystem[] = [];
let asked: string[] = [];
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  saved = [];
  asked = [];
  document.body.innerHTML = "";
});

const px = (value: number) => ({ value, unit: "px" as const });
const design: DesignSystem = {
  schemaVersion: 1,
  variables: {
    colors: [
      { id: "brand", name: "Brand", value: "#112233" },
      { id: "ink", name: "Ink", value: "#000000" },
      { id: "paper", name: "Paper", value: "#ffffff" },
      { id: "accent", name: "Accent", value: "#ff0000" },
    ],
    fonts: [{ id: "brand", name: "Brand", value: "Inter, sans-serif" }],
    fontSizes: [
      { id: "brand", name: "Brand", value: px(20) },
      { id: "small", name: "Small", value: px(12) },
      { id: "big", name: "Big", value: px(32) },
      { id: "huge", name: "Huge", value: px(48) },
    ],
    spacings: [{ id: "brand", name: "Brand", value: px(8) }],
  },
  classes: [
    { id: "card", name: "Card", style: { color: "#112233" } },
    { id: "hero", name: "Hero", style: {} },
    { id: "note", name: "Note", style: {} },
    { id: "badge", name: "Badge", style: {} },
  ],
};

const layout: Layout = {
  schemaVersion: 1,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "head0001", type: "heading", props: { text: "Hi", level: 1 }, classes: ["card"] },
    ],
  },
} as Layout;

/** The section's HTML with generated element ids numbered by first appearance. */
function html() {
  const ids = new Map<string, string>();
  return host.innerHTML.replace(/base-ui-[\w-]+/g, (id) => {
    if (!ids.has(id)) ids.set(id, `id-${ids.size}`);
    return ids.get(id) ?? id;
  });
}

async function mount(element: React.ReactElement) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(element));
}

const onSave = async (next: DesignSystem) => {
  saved.push(next);
};
const onAskDelete = (id: string, name: string) => asked.push(`${id}:${name}`);

const inputs = (label: string) =>
  [...host.querySelectorAll("label")]
    .filter((l) => l.textContent === label)
    .map((l) => (l.htmlFor ? host.querySelector<HTMLInputElement>(`[id="${l.htmlFor}"]`) : null))
    .filter((i): i is HTMLInputElement => Boolean(i));

async function type(field: HTMLInputElement | undefined, value: string) {
  expect(field).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, value);
    field?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(match: (b: HTMLButtonElement) => boolean) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(match);
  expect(button).toBeTruthy();
  await act(async () => button?.click());
}
const byText = (text: string) => (b: HTMLButtonElement) => b.textContent === text;
const byLabel = (text: string) => (b: HTMLButtonElement) => b.getAttribute("aria-label") === text;

const KINDS: [VariableKind, string, string][] = [
  ["color", "#abcdef", "Colors"],
  ["font", "Georgia, serif", "Fonts"],
  ["fontSize", "18", "Font sizes"],
  ["spacing", "24", "Spacing"],
];

describe("VariableSection", () => {
  for (const [kind, newValue, title] of KINDS) {
    test(`${kind}: list, filter, rename, value, create`, async () => {
      await mount(
        <VariableSection
          title={title}
          kind={kind}
          design={design}
          layout={layout}
          onSave={onSave}
          onAskDelete={onAskDelete}
        />,
      );
      expect(html()).toMatchSnapshot("list");
      const filter = inputs("Filter")[0];
      if (filter) {
        await type(filter, "zz");
        expect(html()).toMatchSnapshot("no matches");
        await type(filter, "--emvb");
        await type(filter, "b");
        expect(html()).toMatchSnapshot("filtered");
        await type(filter, "");
      }
      await type(inputs("Name")[0], "Renamed");
      const valueLabel = kind === "color" || kind === "font" ? "Value" : "Value (px)";
      await type(inputs(valueLabel)[0], "-1");
      await type(inputs(valueLabel)[0], newValue);
      await click(byLabel(`Delete ${design.variables.colors[0]?.name}`));
      await click(byText("New"));
      expect(html()).toMatchSnapshot("create row");
      await type(inputs("Name").at(-1), "Brand");
      await click(byText("Create"));
      await click(byText("New"));
      await type(inputs("Name").at(-1), "  ");
      await click(byText("Create"));
      await click(byText("Cancel"));
      expect({ saved, asked }).toMatchSnapshot("saves");
      expect(html()).toMatchSnapshot("after");
    });
  }
});

describe("ClassesSection", () => {
  test("list, filter, rename, duplicate, delete, create", async () => {
    await mount(
      <ClassesSection design={design} layout={layout} onSave={onSave} onAskDelete={onAskDelete} />,
    );
    expect(html()).toMatchSnapshot("list");
    await type(inputs("Filter")[0], "emvb-k-no");
    expect(html()).toMatchSnapshot("filtered");
    await type(inputs("Filter")[0], "");
    await type(inputs("Name")[0], "Card 2");
    await click(byLabel("Duplicate Card"));
    await click(byLabel("Delete Hero"));
    await click(byText("Edit styles"));
    expect(html()).toMatchSnapshot("editing");
    await click(byText("Hide styles"));
    await click(byText("New"));
    await type(inputs("Name").at(-1), "Card");
    await click(byText("Create class"));
    expect({ saved, asked }).toMatchSnapshot("saves");
    expect(html()).toMatchSnapshot("after");
  });
});
