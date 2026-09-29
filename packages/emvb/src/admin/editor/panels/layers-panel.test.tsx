import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { Layout } from "../../../core/index.ts";
import { EXISTING_ELEMENT_MIME } from "../dnd/drop-target.ts";
import { LayersPanel } from "./LayersPanel.tsx";
import { cleanup, mount as mountTree } from "../../../../test/dom/mount.ts";

const layout: Layout = {
  schemaVersion: 1,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "head0001", type: "heading", props: { text: "One", level: 1 } },
      {
        id: "box00001",
        type: "container",
        props: {},
        children: [{ id: "head0002", type: "heading", props: { text: "Two", level: 2 } }],
      },
    ],
  },
};

let calls: string[] = [];

afterEach(async () => {
  await cleanup();
  calls = [];
});

async function mount(selectedId: string | null) {
  const log = (name: string) => (id: string) => calls.push(`${name}:${id}`);
  await mountTree(
    <LayersPanel
      layout={layout}
      selectedId={selectedId}
      onSelect={log("select")}
      onDuplicate={log("duplicate")}
      onMoveUp={log("up")}
      onMoveDown={log("down")}
      onDelete={log("delete")}
    />,
  );
}

const visibleRows = () =>
  [...document.querySelectorAll("[data-emvb-layer]")].map((row) =>
    row.getAttribute("data-emvb-layer"),
  );
const tree = () => document.querySelector('[role="tree"]') as HTMLElement;
const caret = (id: string) =>
  document.querySelector(`[data-emvb-layer="${id}"] [role="button"]`) as HTMLElement;

async function press(key: string, init: KeyboardEventInit = {}) {
  await act(async () => {
    tree().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
  });
}

async function clickEl(element: Element | null) {
  expect(element).toBeTruthy();
  await act(async () => (element as HTMLElement).click());
}

describe("Layers panel (W-018)", () => {
  test("lists every element with its heading text, and the caret collapses and expands", async () => {
    await mount(null);
    expect(visibleRows()).toEqual(["root0001", "head0001", "box00001", "head0002"]);
    expect(document.querySelector('[data-emvb-layer="head0001"]')?.textContent).toContain("One");
    await clickEl(caret("box00001"));
    expect(visibleRows()).toEqual(["root0001", "head0001", "box00001"]);
    expect(caret("box00001").getAttribute("aria-label")).toBe("Expand");
    expect(caret("box00001").closest("li")?.getAttribute("aria-expanded")).toBe("false");
    await clickEl(caret("box00001"));
    expect(visibleRows()).toEqual(["root0001", "head0001", "box00001", "head0002"]);
    expect(calls).toEqual([]);
  });

  test("↑/↓ select neighbours; → enters and ← leaves; Enter and Shift+Enter too", async () => {
    await mount("box00001");
    await press("ArrowDown");
    await press("ArrowUp");
    await press("ArrowRight");
    await press("Enter");
    await press("Enter", { shiftKey: true });
    expect(calls).toEqual([
      "select:head0002",
      "select:head0001",
      "select:head0002",
      "select:head0002",
      "select:root0001",
    ]);
  });

  test("← collapses an open container first, then → expands it before entering", async () => {
    await mount("box00001");
    await press("ArrowLeft");
    expect(visibleRows()).toEqual(["root0001", "head0001", "box00001"]);
    await press("ArrowLeft");
    expect(calls).toEqual(["select:root0001"]);
    await press("ArrowRight");
    expect(visibleRows()).toEqual(["root0001", "head0001", "box00001", "head0002"]);
    expect(calls).toEqual(["select:root0001"]);
  });

  test("the actions menu runs each action once and closes; the root has no menu", async () => {
    await mount(null);
    expect(document.querySelector('[aria-label="Actions for Container"]')).toBeTruthy();
    expect(
      document.querySelectorAll('[data-emvb-layer="root0001"] .emvb-layer-menu-btn').length,
    ).toBe(0);
    const run = async (label: string) => {
      await clickEl(document.querySelector('[data-emvb-layer="head0001"] .emvb-layer-menu-btn'));
      const item = [...document.querySelectorAll('[role="menuitem"]')].find(
        (el) => el.textContent === label,
      );
      await clickEl(item ?? null);
      expect(document.querySelector('[role="menu"]')).toBeNull();
      return calls.at(-1);
    };
    expect(await run("Duplicate")).toBe("duplicate:head0001");
    expect(await run("Move up")).toBe("up:head0001");
    expect(await run("Move down")).toBe("down:head0001");
    expect(await run("Delete")).toBe("delete:head0001");
    expect(calls).toHaveLength(4);
  });

  test("rows drag by id, except the root", async () => {
    await mount(null);
    const select = (id: string) =>
      document.querySelector(`[data-emvb-layer="${id}"] .emvb-layer-select`) as HTMLElement;
    expect(select("root0001").getAttribute("draggable")).toBe("false");
    expect(select("head0002").getAttribute("draggable")).toBe("true");
    const data = new Map<string, string>();
    const event = new Event("dragstart", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: { setData: (type: string, value: string) => data.set(type, value), effectAllowed: "" },
    });
    await act(async () => select("head0002").dispatchEvent(event));
    expect(data.get(EXISTING_ELEMENT_MIME)).toBe("head0002");
  });
});
