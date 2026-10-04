import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { Layout } from "../../../core/index.ts";
import { EXISTING_ELEMENT_MIME } from "../dnd/drop-target.ts";
import { LayersPanel } from "./LayersPanel.tsx";
import type { ClipboardActions } from "../useClipboardActions.ts";
import { cleanup, mount as mountTree } from "../../../../test/dom/mount.ts";

const layout: Layout = {
  schemaVersion: 10,
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
      expect(document.querySelector('[role="menu"]')?.outerHTML ?? null).toBeNull();
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

describe("state styles dot (W-089)", () => {
  test("a row shows the dot only when its element has state styles", async () => {
    const withStates: Layout = {
      ...layout,
      root: {
        ...layout.root,
        children: [
          { id: "head0001", type: "heading", props: { text: "One", level: 1 }, states: {} },
          {
            id: "head0003",
            type: "heading",
            props: { text: "Three", level: 2 },
            states: { hover: { color: "#ff0000" } },
          },
        ],
      },
    };
    await mountTree(
      <LayersPanel
        layout={withStates}
        selectedId={null}
        onSelect={() => undefined}
        onDuplicate={() => undefined}
        onMoveUp={() => undefined}
        onMoveDown={() => undefined}
        onDelete={() => undefined}
      />,
    );
    const dot = (id: string) =>
      document.querySelector(`[data-emvb-layer="${id}"] [aria-label="Has state styles"]`);
    expect(Boolean(dot("head0003"))).toBe(true);
    expect(Boolean(dot("head0001"))).toBe(false);
    expect(Boolean(dot("root0001"))).toBe(false);
  });
});

describe("copy and paste in the Layers menu (W-093)", () => {
  const clipboard = (blocked: {
    paste: string | null;
    style: string | null;
  }): ClipboardActions => ({
    copy: (id) => calls.push(`copy:${id}`),
    copyStyle: (id) => calls.push(`copy-style:${id}`),
    paste: (id, mode = "auto") => calls.push(`paste-${mode}:${id}`),
    pasteStyle: (id) => calls.push(`paste-style:${id}`),
    pasteBlocked: blocked.paste,
    pasteStyleBlocked: blocked.style,
  });
  const mountWith = async (clip: ClipboardActions) => {
    const log = (name: string) => (id: string) => calls.push(`${name}:${id}`);
    await mountTree(
      <LayersPanel
        layout={layout}
        selectedId={null}
        onSelect={log("select")}
        onDuplicate={log("duplicate")}
        onMoveUp={log("up")}
        onMoveDown={log("down")}
        onDelete={log("delete")}
        clipboard={clip}
      />,
    );
  };
  const openMenu = (id: string) =>
    clickEl(document.querySelector(`[data-emvb-layer="${id}"] .emvb-layer-menu-btn`));
  const items = () =>
    [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].map((el) =>
      el.disabled ? `${el.textContent} (off)` : el.textContent,
    );
  const run = async (id: string, label: string) => {
    await openMenu(id);
    await clickEl(
      [...document.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent === label) ??
        null,
    );
    return calls.at(-1);
  };

  test("an element gets Copy, Paste, Duplicate and the style items; a parent also Paste inside", async () => {
    await mountWith(clipboard({ paste: null, style: null }));
    await openMenu("head0001");
    expect(items()).toEqual([
      "Copy",
      "Paste",
      "Duplicate",
      "Copy style",
      "Paste style",
      "Move up",
      "Move down",
      "Delete",
    ]);
    await openMenu("head0001");
    await openMenu("box00001");
    expect(items()).toEqual([
      "Copy",
      "Paste",
      "Paste inside",
      "Duplicate",
      "Copy style",
      "Paste style",
      "Move up",
      "Move down",
      "Delete",
    ]);
    expect(document.querySelector("[data-emvb-paste-hint]")?.outerHTML ?? null).toBeNull();
  });

  test("each item runs its action on that row", async () => {
    await mountWith(clipboard({ paste: null, style: null }));
    expect(await run("head0001", "Copy")).toBe("copy:head0001");
    expect(await run("head0001", "Paste")).toBe("paste-auto:head0001");
    expect(await run("box00001", "Paste inside")).toBe("paste-inside:box00001");
    expect(await run("head0001", "Copy style")).toBe("copy-style:head0001");
    expect(await run("head0001", "Paste style")).toBe("paste-style:head0001");
    expect(await run("head0001", "Duplicate")).toBe("duplicate:head0001");
  });

  test("the page's outer container gets the items that apply to it", async () => {
    await mountWith(clipboard({ paste: null, style: null }));
    await openMenu("root0001");
    expect(items()).toEqual(["Copy", "Paste inside", "Copy style", "Paste style"]);
    await clickEl(
      [...document.querySelectorAll('[role="menuitem"]')].find(
        (el) => el.textContent === "Paste inside",
      ) ?? null,
    );
    expect(calls.at(-1)).toBe("paste-inside:root0001");
  });

  test("with nothing copied the paste items are off, with the reason", async () => {
    await mountWith(
      clipboard({ paste: "Copy an element first.", style: "Copy an element or a style first." }),
    );
    await openMenu("box00001");
    expect(items()).toEqual([
      "Copy",
      "Paste (off)",
      "Paste inside (off)",
      "Duplicate",
      "Copy style",
      "Paste style (off)",
      "Move up",
      "Move down",
      "Delete",
    ]);
    expect(document.querySelector("[data-emvb-paste-hint]")?.textContent ?? null).toBe(
      "Copy an element or a style first.",
    );
  });

  test("with only a style copied, Paste is off and says to copy an element", async () => {
    await mountWith(clipboard({ paste: "Copy an element first.", style: null }));
    await openMenu("head0001");
    expect(items()).toContain("Paste (off)");
    expect(items()).toContain("Paste style");
    expect(document.querySelector("[data-emvb-paste-hint]")?.textContent ?? null).toBe(
      "Copy an element first.",
    );
  });
});
