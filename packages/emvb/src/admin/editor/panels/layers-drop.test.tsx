import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { REASONS, type Layout } from "../../../core/index.ts";
import { dragStash } from "../dnd/drag-stash.ts";
import { EXISTING_ELEMENT_MIME, NEW_ELEMENT_MIME } from "../dnd/drop-target.ts";
import { EXPAND_DELAY_MS, TAB_SPRING_MS } from "../dnd/layer-drop.ts";
import { LayersPanel } from "./LayersPanel.tsx";
import { LeftPanel } from "./LeftPanel.tsx";
import { cleanup, mount } from "../../../../test/dom/mount.ts";

// root
//   head0001
//   box00001
//     head0002
const layout: Layout = {
  schemaVersion: 18,
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
  dragStash.clear();
  sessionStorage.clear();
  calls = [];
});

const noop = () => undefined;

async function mountLayers() {
  await mount(
    <LayersPanel
      layout={layout}
      selectedId={null}
      onSelect={noop}
      onDuplicate={noop}
      onMoveUp={noop}
      onMoveDown={noop}
      onDelete={noop}
      onDropNew={(type, parentId, index) => calls.push(`new:${type}:${parentId}:${index}`)}
      onMoveTo={(id, parentId, index) => calls.push(`move:${id}:${parentId}:${index}`)}
    />,
  );
}

const ROW_TOP = 100;
const ROW_HEIGHT = 28;

const rowEl = (id: string) =>
  document.querySelector(`[data-emvb-layer="${id}"]`) as HTMLElement | null;

/** Gives a row a 28 px box at y = 100, as the browser would lay it out. */
function placeRow(id: string) {
  const row = rowEl(id);
  if (!row) throw new Error(`no row ${id}`);
  row.getBoundingClientRect = () =>
    ({ top: ROW_TOP, left: 0, width: 240, height: ROW_HEIGHT, bottom: 128, right: 240 }) as DOMRect;
  return row;
}

/** A drag event over a row at `part` of its height (0 top, 1 bottom), carrying `payload`. */
async function fire(
  type: "dragover" | "drop" | "dragenter",
  target: Element,
  payload: { mime: string; value: string },
  part = 0.5,
  x = 200,
) {
  const transfer = {
    types: [payload.mime],
    getData: (mime: string) => (type === "drop" && mime === payload.mime ? payload.value : ""),
    dropEffect: "",
  };
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: transfer });
  Object.defineProperty(event, "clientY", { value: ROW_TOP + ROW_HEIGHT * part });
  Object.defineProperty(event, "clientX", { value: x });
  Object.defineProperty(event, "relatedTarget", { value: null });
  await act(async () => target.dispatchEvent(event));
  return { prevented: event.defaultPrevented, dropEffect: transfer.dropEffect };
}

const heading = { mime: NEW_ELEMENT_MIME, value: "heading" };
const label = (id: string) => rowEl(id)?.querySelector(".emvb-layer-select") as Element;

describe("dropping on Layers (W-1080)", () => {
  test("an Add tile between two rows draws the line and adds there", async () => {
    await mountLayers();
    dragStash.new("heading");
    placeRow("head0001");
    const over = await fire("dragover", label("head0001"), heading, 0.9);
    expect(over.prevented).toBe(true);
    expect(over.dropEffect).toBe("copy");
    expect(document.querySelector("[data-emvb-layer-drop-line]") !== null).toBe(true);
    expect(document.querySelector("[data-emvb-drop]")?.outerHTML ?? null).toBeNull();
    await fire("drop", label("head0001"), heading, 0.9);
    expect(calls).toEqual(["new:heading:root0001:1"]);
    expect(document.querySelector("[data-emvb-layer-drop-line]")?.outerHTML ?? null).toBeNull();
  });

  test("the middle of a container row outlines it and drops inside, at the end", async () => {
    await mountLayers();
    dragStash.existing("head0001");
    placeRow("box00001");
    const payload = { mime: EXISTING_ELEMENT_MIME, value: "head0001" };
    const over = await fire("dragover", label("box00001"), payload, 0.5);
    expect(over.dropEffect).toBe("move");
    expect(rowEl("box00001")?.getAttribute("data-emvb-drop")).toBe("inside");
    expect(document.querySelector("[data-emvb-layer-drop-line]")?.outerHTML ?? null).toBeNull();
    await fire("drop", label("box00001"), payload, 0.5);
    expect(calls).toEqual(["move:head0001:box00001:1"]);
  });

  test("a container over its own child is refused with the canvas's reason", async () => {
    await mountLayers();
    dragStash.existing("box00001");
    placeRow("head0002");
    const payload = { mime: EXISTING_ELEMENT_MIME, value: "box00001" };
    const over = await fire("dragover", label("head0002"), payload, 0.1);
    expect(over.dropEffect).toBe("none");
    expect(rowEl("head0002")?.getAttribute("data-emvb-drop")).toBe("invalid");
    expect(document.querySelector("[data-emvb-layer-drop-refusal]")?.textContent).toBe(
      REASONS.intoItself,
    );
    expect(document.querySelector("[data-emvb-layer-drop-line]")?.outerHTML ?? null).toBeNull();
    await fire("drop", label("head0002"), payload, 0.1);
    expect(calls).toEqual([]);
  });

  test("leaving the list clears the line; drags that aren't EmVB's are ignored", async () => {
    await mountLayers();
    dragStash.new("heading");
    placeRow("head0001");
    await fire("dragover", label("head0001"), heading, 0.1);
    expect(document.querySelector("[data-emvb-layer-drop-line]") !== null).toBe(true);
    // Moving onto another row's label stays; entering anything outside Layers clears.
    await fire("dragenter", label("head0002"), heading);
    expect(document.querySelector("[data-emvb-layer-drop-line]") !== null).toBe(true);
    await fire("dragenter", document.body, heading);
    expect(document.querySelector("[data-emvb-layer-drop-line]")?.outerHTML ?? null).toBeNull();
    dragStash.clear();
    const files = await fire("dragover", label("head0001"), { mime: "Files", value: "" }, 0.1);
    expect(files.prevented).toBe(false);
  });

  test("a collapsed container opens after hovering it during a drag", async () => {
    await mountLayers();
    const caret = rowEl("box00001")?.querySelector('[role="button"]') as HTMLElement;
    await act(async () => caret.click());
    expect(rowEl("head0002")?.outerHTML ?? null).toBeNull();
    dragStash.new("heading");
    placeRow("box00001");
    await fire("dragover", label("box00001"), heading, 0.5);
    await act(() => new Promise((resolve) => setTimeout(resolve, EXPAND_DELAY_MS / 2)));
    expect(rowEl("head0002")?.outerHTML ?? null).toBeNull();
    await act(() => new Promise((resolve) => setTimeout(resolve, EXPAND_DELAY_MS / 2 + 100)));
    expect(rowEl("head0002") !== null).toBe(true);
  });

  test("in RTL the pointer's distance from the right edge picks the depth", async () => {
    // root > box00001 > head0002 (last child): left of the box's indent in RTL is the right.
    await mount(
      <div dir="rtl">
        <LayersPanel
          layout={layout}
          selectedId={null}
          onSelect={noop}
          onDuplicate={noop}
          onMoveUp={noop}
          onMoveDown={noop}
          onDelete={noop}
          onDropNew={(type, parentId, index) => calls.push(`new:${type}:${parentId}:${index}`)}
        />
      </div>,
    );
    dragStash.new("heading");
    placeRow("head0002");
    // Near the right edge (inline start): climbs out after the box, into the page.
    await fire("drop", label("head0002"), heading, 0.9, 235);
    // Near the left edge (deep inline end): stays after head0002 inside the box.
    placeRow("head0002");
    await fire("drop", label("head0002"), heading, 0.9, 10);
    expect(calls).toEqual(["new:heading:root0001:2", "new:heading:box00001:1"]);
    expect(rowEl("head0002")?.style.paddingInlineStart).toBe("32px");
  });

  test("without drop callbacks Layers takes no drops", async () => {
    await mount(
      <LayersPanel
        layout={layout}
        selectedId={null}
        onSelect={noop}
        onDuplicate={noop}
        onMoveUp={noop}
        onMoveDown={noop}
        onDelete={noop}
      />,
    );
    dragStash.new("heading");
    placeRow("head0001");
    expect((await fire("dragover", label("head0001"), heading, 0.1)).prevented).toBe(false);
  });
});

describe("the Layers tab opens under a drag from Add (W-1080)", () => {
  test("hovering the tab switches to Layers and keeps the Add panel mounted, hidden", async () => {
    await mount(
      <LeftPanel
        layout={layout}
        selectedId={null}
        onSelect={noop}
        onAdd={noop}
        onDuplicate={noop}
        onMoveUp={noop}
        onMoveDown={noop}
        onDelete={noop}
        onDropNew={noop}
        onMoveTo={noop}
      />,
    );
    const tab = [...document.querySelectorAll('[role="tab"]')].find((el) =>
      (el.textContent ?? "").includes("Layers"),
    ) as Element;
    dragStash.new("heading");
    const tile = document.querySelector('[data-emvb-add-tile="heading"]');
    await fire("dragover", tab, heading);
    expect(document.querySelector('[data-emvb-panel="layers"]')?.outerHTML ?? null).toBeNull();
    await act(() => new Promise((resolve) => setTimeout(resolve, TAB_SPRING_MS + 100)));
    expect(document.querySelector('[data-emvb-panel="layers"]') !== null).toBe(true);
    const held = document.querySelector("[data-emvb-add-held]");
    expect(held?.hasAttribute("hidden")).toBe(true);
    // The very tile being dragged stays in the page, so the browser still sends it dragend.
    expect(held?.querySelector('[data-emvb-add-tile="heading"]') === tile).toBe(true);
    expect(tile?.isConnected).toBe(true);
    await act(async () => window.dispatchEvent(new Event("dragend")));
    expect(document.querySelector("[data-emvb-add-held]")?.outerHTML ?? null).toBeNull();
  });

  test("a dragenter on the tab alone switches too, as Chromium's synthetic drags send", async () => {
    await mount(
      <LeftPanel
        layout={layout}
        selectedId={null}
        onSelect={noop}
        onAdd={noop}
        onDuplicate={noop}
        onMoveUp={noop}
        onMoveDown={noop}
        onDelete={noop}
        onDropNew={noop}
        onMoveTo={noop}
      />,
    );
    const tab = [...document.querySelectorAll('[role="tab"]')].find((el) =>
      (el.textContent ?? "").includes("Layers"),
    ) as Element;
    dragStash.new("heading");
    await fire("dragenter", tab, heading);
    await act(() => new Promise((resolve) => setTimeout(resolve, TAB_SPRING_MS + 100)));
    expect(document.querySelector('[data-emvb-panel="layers"]') !== null).toBe(true);
    // A dragenter on a row is taken as the drop target, like dragover.
    placeRow("head0001");
    expect((await fire("dragenter", label("head0001"), heading, 0.9)).prevented).toBe(true);
  });

  test("entering anything else before the delay keeps Add open", async () => {
    await mount(
      <LeftPanel
        layout={layout}
        selectedId={null}
        onSelect={noop}
        onAdd={noop}
        onDuplicate={noop}
        onMoveUp={noop}
        onMoveDown={noop}
        onDelete={noop}
        onDropNew={noop}
        onMoveTo={noop}
      />,
    );
    const tab = [...document.querySelectorAll('[role="tab"]')].find((el) =>
      (el.textContent ?? "").includes("Layers"),
    ) as Element;
    dragStash.new("heading");
    await fire("dragover", tab, heading);
    await fire("dragenter", document.body, heading);
    await act(() => new Promise((resolve) => setTimeout(resolve, TAB_SPRING_MS + 100)));
    expect(document.querySelector('[data-emvb-panel="layers"]')?.outerHTML ?? null).toBeNull();
  });
});
