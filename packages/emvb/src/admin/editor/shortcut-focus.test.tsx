import { afterEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import type { Layout } from "../../core/index.ts";
import type { EditorState, HistoryAction } from "./store.ts";
import { useEditorShortcuts, type ShortcutHandlers } from "./useEditorShortcuts.ts";
import { cleanup, mount } from "../../../test/dom/mount.ts";

afterEach(cleanup);

const layout: Layout = {
  schemaVersion: 13,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "head0001", type: "heading", props: { text: "One", level: 2 } },
      { id: "text0001", type: "text", props: { text: "Two" } },
    ],
  },
};

type Seen = string[];

let canvasKeys: ((event: KeyboardEvent) => void) | null = null;

function Harness({ seen }: { seen: Seen }) {
  const latest = React.useRef({
    page: { layout },
    selectedId: "text0001",
  } as unknown as EditorState);
  const handlers = React.useRef<ShortcutHandlers>({
    save: () => seen.push("save"),
    remove: (id) => seen.push(`remove ${id}`),
    duplicate: (id) => seen.push(`duplicate ${id}`),
    arrange: (id) => seen.push(`arrange ${id}`),
    copy: (id) => seen.push(`copy ${id}`),
    paste: (id) => seen.push(`paste ${id}`),
    pasteStyle: (id) => seen.push(`paste-style ${id}`),
  });
  const dispatch = (action: HistoryAction) =>
    seen.push(action.type === "select" ? `select ${action.id}` : action.type);
  // The canvas forwards its iframe's keydowns to the returned handler (canvas-events.ts).
  canvasKeys = useEditorShortcuts({ latest, dispatch, handlers });
  return (
    <div>
      <aside data-emvb-panel="element">
        <div role="tablist">
          <button type="button" role="tab" data-target="tab">
            Style
          </button>
        </div>
        <button type="button" aria-expanded="true" data-target="header">
          Typography
        </button>
        <input aria-label="Text" data-target="input" />
      </aside>
      <div data-emvb-panel="layers">
        <button type="button" className="emvb-layer-select" data-target="layer">
          Text
        </button>
      </div>
      <div className="emvb-stage">
        <div className="emvb-overlay">
          <button type="button" data-target="toolbar">
            Delete element
          </button>
          <textarea aria-label="Edit text" data-target="canvas-text" />
        </div>
      </div>
    </div>
  );
}

const target = (name: string) => {
  const found = document.querySelector<HTMLElement>(`[data-target="${name}"]`);
  if (!found) throw new Error(`no ${name}`);
  return found;
};

async function press(on: EventTarget, key: string, init: KeyboardEventInit = {}) {
  await act(async () => {
    on.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
    );
  });
}

describe("element shortcuts only act from the canvas, Layers, or nothing focused (W-132)", () => {
  test("↑, Enter, Delete, Escape, Ctrl+D and Ctrl+C on a panel tab or section header do nothing", async () => {
    const seen: Seen = [];
    await mount(<Harness seen={seen} />);
    for (const name of ["tab", "header"]) {
      // oxlint-disable-next-line no-await-in-loop
      await press(target(name), "ArrowUp");
      // oxlint-disable-next-line no-await-in-loop
      await press(target(name), "Enter", { shiftKey: true });
      // oxlint-disable-next-line no-await-in-loop
      await press(target(name), "Delete");
      // oxlint-disable-next-line no-await-in-loop
      await press(target(name), "Escape");
      // oxlint-disable-next-line no-await-in-loop
      await press(target(name), "d", { ctrlKey: true });
      // oxlint-disable-next-line no-await-in-loop
      await press(target(name), "c", { ctrlKey: true });
      // oxlint-disable-next-line no-await-in-loop
      await press(target(name), "ArrowDown", { altKey: true });
    }
    expect(seen).toEqual([]);
  });

  test("the same keys act from Layers, the canvas overlay, the canvas document and with nothing focused", async () => {
    const seen: Seen = [];
    await mount(<Harness seen={seen} />);
    await press(target("layer"), "ArrowUp");
    await press(target("toolbar"), "Delete");
    const canvasDoc = document.implementation.createHTMLDocument("canvas");
    const inCanvas = canvasDoc.createElement("p");
    canvasDoc.body.append(inCanvas);
    inCanvas.addEventListener("keydown", (event) => {
      // happy-dom shares one window between documents; a real iframe's events stay in it.
      event.stopPropagation();
      canvasKeys?.(event);
    });
    await press(inCanvas, "ArrowUp");
    await press(document.body, "d", { ctrlKey: true });
    await press(window, "Enter", { shiftKey: true });
    expect(seen).toEqual([
      "select head0001",
      "remove text0001",
      "select head0001",
      "duplicate text0001",
      "select root0001",
    ]);
  });

  test("a key the Layers tree already handled doesn't move the selection again (W-257)", async () => {
    const seen: Seen = [];
    await mount(<Harness seen={seen} />);
    const handled = (event: Event) => event.preventDefault();
    target("layer").addEventListener("keydown", handled);
    await press(target("layer"), "ArrowUp");
    await press(target("layer"), "ArrowDown");
    await press(target("layer"), "Enter");
    target("layer").removeEventListener("keydown", handled);
    expect(seen).toEqual([]);
  });

  test("Enter on a toolbar button and keys in a Layers row menu don't walk the tree (W-258)", async () => {
    const seen: Seen = [];
    await mount(<Harness seen={seen} />);
    const menu = document.createElement("span");
    menu.className = "emvb-layer-menu";
    menu.innerHTML = '<button type="button" data-target="row-menu">···</button>';
    document.querySelector('[data-emvb-panel="layers"]')?.append(menu);
    await press(target("toolbar"), "Enter");
    await press(target("row-menu"), "Enter");
    await press(target("row-menu"), "ArrowDown");
    expect(seen).toEqual([]);
    await press(target("layer"), "Enter", { shiftKey: true });
    expect(seen).toEqual(["select root0001"]);
  });

  test("Save, undo and redo still work from a panel tab, but not from a text field", async () => {
    const seen: Seen = [];
    await mount(<Harness seen={seen} />);
    await press(target("tab"), "z", { ctrlKey: true });
    await press(target("header"), "y", { ctrlKey: true });
    await press(target("tab"), "s", { ctrlKey: true });
    await press(target("input"), "z", { ctrlKey: true });
    await press(target("input"), "ArrowUp");
    expect(seen).toEqual(["undo", "redo", "save"]);
  });

  test("Ctrl+D does not duplicate while the canvas text editor is focused, and Delete and ↑ stay in it", async () => {
    const seen: Seen = [];
    await mount(<Harness seen={seen} />);
    await press(target("canvas-text"), "d", { ctrlKey: true });
    await press(target("canvas-text"), "Delete");
    await press(target("canvas-text"), "ArrowUp");
    await press(target("canvas-text"), "c", { ctrlKey: true });
    expect(seen).toEqual([]);
  });
});
