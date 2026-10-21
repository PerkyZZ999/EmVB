import { describe, expect, test } from "bun:test";
import type { Layout } from "../../../core/index.ts";
import { treeKey } from "./LayersPanel.tsx";

const layout = {
  schemaVersion: 15,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "head0001", type: "heading", props: { text: "A", level: 2 } },
      { id: "head0002", type: "heading", props: { text: "B", level: 2 } },
    ],
  },
} as unknown as Layout;
const key = (k: string, mods: Record<string, boolean> = {}) =>
  treeKey({ key: k, shiftKey: false, ...mods }, layout, "head0002", new Set(), undefined);

describe("Layers tree keys (W-233)", () => {
  test("plain arrows and Enter walk the tree", () => {
    expect(key("ArrowUp")).toEqual({ select: "head0001" });
    expect(key("ArrowLeft")).toEqual({ select: "root0001" });
  });

  test("Alt, Ctrl and ⌘ keys are left to the editor shortcuts (Alt+arrows move)", () => {
    for (const mods of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }] as Record<
      string,
      boolean
    >[])
      for (const k of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"])
        expect(key(k, mods)).toBeNull();
  });
});

describe("Layers arrows skip collapsed rows (W-520)", () => {
  const nested = {
    schemaVersion: 17,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        {
          id: "sec00001",
          type: "container",
          props: {},
          children: [{ id: "head0001", type: "heading", props: { text: "A", level: 2 } }],
        },
        { id: "head0002", type: "heading", props: { text: "B", level: 2 } },
      ],
    },
  } as unknown as Layout;
  const shut = new Set(["sec00001"]);
  const press = (k: string, id: string) =>
    treeKey({ key: k, shiftKey: false }, nested, id, shut, undefined);

  test("Down from a collapsed section goes to the next shown row", () => {
    expect(press("ArrowDown", "sec00001")).toEqual({ select: "head0002" });
  });

  test("Up goes to the collapsed section, not into it", () => {
    expect(press("ArrowUp", "head0002")).toEqual({ select: "sec00001" });
  });
});
