import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { emptyDesign, type Layout } from "../../core/index.ts";
import { cleanup, mount } from "../../../test/dom/mount.ts";
import { CommandPalette } from "./CommandPalette.tsx";
import { EditorOverlay } from "./EditorOverlay.tsx";
import { filterPalette, fuzzyScore, type PaletteItem } from "./palette.ts";
import { paletteItems } from "./palette-items.ts";

afterEach(cleanup);

const layout: Layout = {
  schemaVersion: 13,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      {
        id: "head0001",
        type: "heading",
        props: { text: "Welcome home", level: 1 },
        label: "Hero title",
      },
      { id: "text0001", type: "text", props: { text: "Pricing details" } },
    ],
  },
};

const design = {
  ...emptyDesign(),
  classes: [{ id: "card", name: "card", style: {} }],
};

function build(log: string[]) {
  return paletteItems({
    layout,
    design,
    selected: layout.root.children[1] ?? null,
    formsAvailable: false,
    insert: (type) => log.push(`insert ${type}`),
    select: (id) => log.push(`select ${id}`),
    applyClass: (nodeId, classId) => log.push(`class ${classId} on ${nodeId}`),
    actions: [{ id: "save", label: "Save draft", run: () => log.push("save") }],
  });
}

describe("command palette (W-314)", () => {
  test("fuzzy matching prefers prefixes, then word starts, and needs letters in order", () => {
    expect(fuzzyScore("hea", "Heading")).toBeGreaterThan(fuzzyScore("hea", "Insert Heading") ?? 0);
    expect(fuzzyScore("ihd", "Insert Heading")).not.toBeNull();
    expect(fuzzyScore("dhi", "Insert Heading")).toBeNull();
  });

  test("items cover actions, insert, layers (with text) and classes for the selection", () => {
    const items = build([]);
    const ids = items.map((i) => i.id);
    expect(ids).toContain("action:save");
    expect(ids).toContain("insert:heading");
    expect(ids).not.toContain("insert:form");
    expect(ids).toContain("layer:head0001");
    expect(items.find((i) => i.id === "layer:head0001")?.label).toBe("Hero title");
    expect(items.find((i) => i.id === "class:card")?.hint).toBe("to Text");
  });

  test("prefixes narrow to one group, and layer text is searchable", () => {
    const items = build([]);
    expect(filterPalette(items, "@pricing").map((i) => i.id)).toEqual(["layer:text0001"]);
    expect(new Set(filterPalette(items, ">").map((i) => i.group))).toEqual(new Set(["Actions"]));
    expect(filterPalette(items, ".card").map((i) => i.id)).toEqual(["class:card"]);
    expect(filterPalette(items, "zzzz")).toEqual([]);
  });

  test("arrow keys and Enter run the chosen command, and the palette closes", async () => {
    const log: string[] = [];
    const states: boolean[] = [];
    const items: PaletteItem[] = build(log);
    await mount(<CommandPalette open onOpenChange={(o) => states.push(o)} items={items} />);
    const input = document.querySelector("[data-emvb-palette-input]") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "@");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    expect(
      document.querySelector('[aria-selected="true"]')?.getAttribute("data-emvb-palette-item"),
    ).toBe("layer:head0001");
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(states).toEqual([false]);
    expect(log).toEqual(["select head0001"]);
  });
});

describe("Ctrl/Cmd+K (W-314)", () => {
  test("opens EmVB's palette and keeps the host's from opening", async () => {
    let opened = 0;
    let hostSaw = false;
    const host = () => {
      hostSaw = true;
    };
    window.addEventListener("keydown", host);
    await mount(
      <EditorOverlay label="Editor" onPalette={() => (opened += 1)}>
        <p>x</p>
      </EditorOverlay>,
    );
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    window.removeEventListener("keydown", host);
    expect(opened).toBe(1);
    expect(hostSaw).toBe(false);
  });
});
