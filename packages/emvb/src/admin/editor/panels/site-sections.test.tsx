import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { DesignSystem, Layout, VariableKind } from "../../../core/index.ts";
import { ClassesSection } from "./ClassesSection.tsx";
import { VariableSection } from "./VariableSection.tsx";
import { cleanup, mount as mountTree, settle } from "../../../../test/dom/mount.ts";

// Snapshots were recorded from both sections before W-086 M5 shared their pieces.
let host: HTMLElement;
let saved: DesignSystem[] = [];
let asked: string[] = [];
afterEach(async () => {
  await cleanup();
  saved = [];
  asked = [];
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
  host = await mountTree(element);
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

const menuItem = (label: string) =>
  [...document.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent === label) as
    | HTMLElement
    | undefined;

async function pick(menu: string, label: string) {
  await click(byLabel(menu));
  await settle();
  const item = menuItem(label);
  expect(item?.textContent ?? null).toBe(label);
  await act(async () => item?.click());
  await settle();
}

/** Rename from a menu starts on the frame after the menu closes. */
const nextFrame = () =>
  act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  });

const renameField = () => host.querySelector<HTMLInputElement>(".emvb-site-rename");

async function press(target: Element | null | undefined, key: string) {
  expect(target?.tagName ?? null).not.toBeNull();
  await act(async () => {
    target?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

async function renameTo(text: string, key: "Enter" | "Escape" | "blur") {
  const field = renameField();
  expect(field?.tagName ?? null).toBe("INPUT");
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, text);
  if (key === "blur") await act(async () => field?.blur());
  else await press(field, key);
  await nextFrame();
}

const classRow = (id: string) =>
  host.querySelector<HTMLButtonElement>(`[data-emvb-class-def="${id}"] .emvb-site-item-main`);
const search = (label: string) =>
  host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
const mountClasses = (d: DesignSystem = design) =>
  mount(<ClassesSection design={d} layout={layout} onSave={onSave} onAskDelete={onAskDelete} />);

describe("ClassesSection", () => {
  test("list, filter, duplicate, delete, create", async () => {
    await mountClasses();
    expect(html()).toMatchSnapshot("list");
    await type(search("Search classes") ?? undefined, "emvb-k-no");
    expect(html()).toMatchSnapshot("filtered");
    await type(search("Search classes") ?? undefined, "zz");
    expect(host.querySelector("[data-emvb-classes-nomatch]")?.textContent).toBe(
      'No classes match "zz".',
    );
    await press(search("Search classes"), "Escape");
    expect(search("Search classes")?.value).toBe("");
    expect(host.querySelectorAll("[data-emvb-class-def]").length).toBe(4);
    await pick("Actions for Card", "Duplicate");
    await pick("Actions for Hero", "Delete");
    await act(async () => classRow("card")?.click());
    expect(classRow("card")?.getAttribute("aria-expanded")).toBe("true");
    expect(html()).toMatchSnapshot("editing");
    await act(async () => classRow("card")?.click());
    expect(classRow("card")?.getAttribute("aria-expanded")).toBe("false");
    await click(byText("New"));
    await type(inputs("Name").at(-1), "Card");
    await click(byText("Create class"));
    expect({ saved, asked }).toMatchSnapshot("saves");
    expect(html()).toMatchSnapshot("after");
  });

  test("the row menu offers Edit styles, Rename, Duplicate, then Delete after a separator", async () => {
    await mountClasses();
    await click(byLabel("Actions for Card"));
    await settle();
    const content = document.querySelector('[role="menu"]');
    const parts = [...(content?.querySelectorAll('[role="menuitem"], [role="separator"]') ?? [])];
    expect(parts.map((el) => el.textContent || el.getAttribute("role"))).toEqual([
      "Edit styles",
      "Rename",
      "Duplicate",
      "separator",
      "Delete",
    ]);
    await act(async () => menuItem("Edit styles")?.click());
    await settle();
    expect(classRow("card")?.getAttribute("aria-expanded")).toBe("true");
    await click(byLabel("Actions for Card"));
    await settle();
    expect(menuItem("Hide styles")?.textContent ?? null).toBe("Hide styles");
  });

  test("renames in place from the menu, F2 or a double-click; Enter or blur saves once", async () => {
    await mountClasses();
    await pick("Actions for Card", "Rename");
    await nextFrame();
    expect(renameField()?.getAttribute("aria-label")).toBe("Rename Card");
    expect(document.activeElement === renameField()).toBe(true);
    await renameTo("  Card big  ", "Enter");
    expect(saved.map((d) => d.classes?.[0]?.name)).toEqual(["Card big"]);
    expect(renameField()?.tagName ?? null).toBeNull();
    expect(document.activeElement === classRow("card")).toBe(true);

    await press(classRow("hero"), "F2");
    await renameTo("Hero banner", "blur");
    expect(saved.at(-1)?.classes?.[1]?.name).toBe("Hero banner");
    expect(saved.length).toBe(2);

    await act(async () =>
      classRow("note")?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })),
    );
    await renameTo("Ignored", "Escape");
    await press(classRow("badge"), "F2");
    await renameTo("   ", "Enter");
    await press(classRow("badge"), "F2");
    await renameTo("Badge", "Enter");
    expect(saved.length).toBe(2);
  });

  test("shows the page usage count, with the full sentence in the tooltip", async () => {
    await mountClasses();
    const usage = (id: string) =>
      host.querySelector(`[data-emvb-class-def="${id}"] [data-emvb-usage]`);
    expect(usage("card")?.textContent).toBe("1 on page");
    expect(usage("card")?.getAttribute("title")).toBe("Used by 1 element on this page");
    expect(usage("hero")?.textContent).toBe("0 on page");
    expect(usage("hero")?.getAttribute("title")).toBe("Used by 0 elements on this page");
  });

  test("an empty site shows a Kumo Empty that points to the Style tab, and no list", async () => {
    await mountClasses({ ...design, classes: [] });
    const empty = host.querySelector("[data-emvb-classes-empty]");
    expect(empty?.textContent).toContain("No classes yet");
    expect(empty?.textContent).toContain("Style tab");
    expect(search("Search classes")?.tagName ?? null).toBeNull();
    await click(byText("New"));
    expect(host.querySelector("[data-emvb-classes-empty]")?.tagName ?? null).toBeNull();
  });
});
