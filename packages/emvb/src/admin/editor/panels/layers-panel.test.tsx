import { afterEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import type { Layout, LayoutNode } from "../../../core/index.ts";
import { EXISTING_ELEMENT_MIME } from "../dnd/drop-target.ts";
import { LayersPanel, layerPreview } from "./LayersPanel.tsx";
import type { ClipboardActions } from "../useClipboardActions.ts";
import { cleanup, mount as mountTree } from "../../../../test/dom/mount.ts";

const layout: Layout = {
  schemaVersion: 14,
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

  test("focus follows the selection while a row has focus (W-257)", async () => {
    function Live() {
      const [selected, setSelected] = React.useState("head0001");
      return (
        <LayersPanel
          layout={layout}
          selectedId={selected}
          onSelect={setSelected}
          onDuplicate={() => undefined}
          onMoveUp={() => undefined}
          onMoveDown={() => undefined}
          onDelete={() => undefined}
        />
      );
    }
    await mountTree(<Live />);
    const button = (id: string) =>
      document.querySelector(`[data-emvb-layer="${id}"] .emvb-layer-select`) as HTMLElement;
    await act(async () => button("head0001").focus());
    await press("ArrowDown");
    expect(document.activeElement).toBe(button("box00001"));
    await press("ArrowUp");
    expect(document.activeElement).toBe(button("head0001"));
  });

  test("Enter on a selected row's ··· button is left to the button (W-258)", async () => {
    await mount("box00001");
    const menuButton = document.querySelector(
      '[data-emvb-layer="box00001"] .emvb-layer-menu-btn',
    ) as HTMLElement;
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    await act(async () => menuButton.dispatchEvent(enter));
    expect(enter.defaultPrevented).toBe(false);
    expect(calls).toEqual([]);
  });

  test("after a row menu action, focus lands on the selected row (W-258)", async () => {
    await mount("head0001");
    await clickEl(document.querySelector('[data-emvb-layer="head0001"] .emvb-layer-menu-btn'));
    const duplicate = [...document.querySelectorAll('[role="menuitem"]')].find(
      (el) => el.textContent === "Duplicate",
    ) as HTMLElement;
    await act(async () => duplicate.focus());
    await clickEl(duplicate);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
    expect(calls).toEqual(["duplicate:head0001"]);
    expect(document.activeElement).toBe(
      document.querySelector('[data-emvb-layer="head0001"] .emvb-layer-select'),
    );
  });

  test("Escape in an open row menu closes it, refocuses ··· and doesn't reach the editor (W-259)", async () => {
    await mount("head0001");
    const menuButton = document.querySelector(
      '[data-emvb-layer="head0001"] .emvb-layer-menu-btn',
    ) as HTMLElement;
    await clickEl(menuButton);
    const item = document.querySelector('[role="menuitem"]') as HTMLElement;
    await act(async () => item.focus());
    let reachedWindow = false;
    const onWindow = () => {
      reachedWindow = true;
    };
    window.addEventListener("keydown", onWindow);
    await act(async () => {
      item.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    window.removeEventListener("keydown", onWindow);
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(menuButton);
    expect(reachedWindow).toBe(false);
  });

  test("a row menu takes ↑/↓/Home/End and opens on its first item (W-260)", async () => {
    await mount("head0001");
    const menuButton = document.querySelector(
      '[data-emvb-layer="head0001"] .emvb-layer-menu-btn',
    ) as HTMLElement;
    const key = async (on: Element, k: string) =>
      act(async () => {
        on.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
      });
    await act(async () => menuButton.focus());
    await key(menuButton, "ArrowDown");
    const items = () =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].filter(
        (item) => !item.disabled,
      );
    expect(items().length).toBeGreaterThan(2);
    expect(document.activeElement).toBe(items()[0] ?? null);
    await key(document.activeElement as Element, "ArrowDown");
    expect(document.activeElement).toBe(items()[1] ?? null);
    await key(document.activeElement as Element, "ArrowUp");
    await key(document.activeElement as Element, "ArrowUp");
    expect(document.activeElement).toBe(items().at(-1) ?? null);
    await key(document.activeElement as Element, "Home");
    expect(document.activeElement).toBe(items()[0] ?? null);
    await key(document.activeElement as Element, "End");
    expect(document.activeElement).toBe(items().at(-1) ?? null);
    await key(document.activeElement as Element, "ArrowDown");
    expect(document.activeElement).toBe(items()[0] ?? null);
    expect(calls).toEqual([]);
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

describe("Layers content preview (W-143)", () => {
  const node = (type: string, props: Record<string, unknown>) =>
    ({ id: "node0001", type, props }) as unknown as Parameters<typeof layerPreview>[0];

  test("text elements, accordion items and tab panels show their own text", () => {
    expect(layerPreview(node("heading", { text: "Pricing", level: 2 }))).toBe("Pricing");
    expect(layerPreview(node("text", { text: "  First line\nSecond line" }))).toBe("First line");
    expect(layerPreview(node("button", { text: "Start free trial" }))).toBe("Start free trial");
    expect(layerPreview(node("link", { text: "Privacy", href: "/privacy" }))).toBe("Privacy");
    expect(layerPreview(node("label", { text: "Email" }))).toBe("Email");
    expect(layerPreview(node("accordion-item", { summary: "Is my data sampled?" }))).toBe(
      "Is my data sampled?",
    );
    expect(layerPreview(node("tab-panel", { label: "Monthly" }))).toBe("Monthly");
  });

  test("an icon shows its title, unless it's still the default Icon (W-246)", () => {
    expect(layerPreview(node("icon", { iconId: "lucide:bell", title: "Notifications" }))).toBe(
      "Notifications",
    );
    expect(layerPreview(node("icon", { iconId: "star", title: "Icon" }))).toBeUndefined();
    expect(layerPreview(node("icon", { iconId: "star" }))).toBeUndefined();
  });

  test("elements without text, or with only spaces, show no preview", () => {
    expect(layerPreview(node("container", {}))).toBeUndefined();
    expect(layerPreview(node("image", { src: "/a.png", alt: "A" }))).toBeUndefined();
    expect(layerPreview(node("text", { text: "   " }))).toBeUndefined();
  });
});

describe("Layers row tooltip (W-168)", () => {
  test("an unnamed row's tooltip has the type and the preview; a box without text has its type", async () => {
    await mount(null);
    const title = (id: string) =>
      document.querySelector(`[data-emvb-layer="${id}"] .emvb-layer-select`)?.getAttribute("title");
    expect(title("head0001")).toBe("Heading: One");
    expect(title("box00001")).toBe("Container");
  });
});

describe("renaming a layer (W-157)", () => {
  const renames: [string, string | undefined][] = [];
  afterEach(() => {
    renames.length = 0;
  });

  function Live({ start }: { start: Layout }) {
    const [page, setPage] = React.useState(start);
    return (
      <LayersPanel
        layout={page}
        selectedId="head0001"
        onSelect={() => undefined}
        onDuplicate={() => undefined}
        onMoveUp={() => undefined}
        onMoveDown={() => undefined}
        onDelete={() => undefined}
        onRename={(id, label) => {
          renames.push([id, label]);
          const relabel = (node: LayoutNode): LayoutNode => {
            const { label: _old, ...rest } = node;
            const next = (
              node.id === id ? (label ? { ...rest, label } : rest) : node
            ) as LayoutNode;
            return "children" in next && Array.isArray(next.children)
              ? ({ ...next, children: next.children.map(relabel) } as LayoutNode)
              : next;
          };
          setPage({ ...page, root: relabel(page.root) as Layout["root"] });
        }}
      />
    );
  }

  const select = (id: string) =>
    document.querySelector(`[data-emvb-layer="${id}"] .emvb-layer-select`) as HTMLButtonElement;
  const field = () => document.querySelector("[data-emvb-layer-rename]") as HTMLInputElement | null;
  async function typeName(text: string, key: "Enter" | "Escape") {
    const input = field();
    if (!input) throw new Error("no rename field");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });
  }

  test("double-click names a row; the name replaces the type and the type moves to the tooltip", async () => {
    await mountTree(<Live start={layout} />);
    await act(async () => {
      select("head0001").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(document.activeElement).toBe(field());
    expect(field()?.placeholder).toBe("Heading");
    await typeName("  Hero title  ", "Enter");
    expect(renames).toEqual([["head0001", "Hero title"]]);
    expect(field()).toBeNull();
    expect(select("head0001").textContent).toContain("Hero title");
    expect(select("head0001").textContent).not.toContain("Heading");
    expect(select("head0001").title).toBe("Hero title (Heading)");
  });

  test("F2 renames and Escape cancels; the menu's Rename with an empty name clears it", async () => {
    const labelled: Layout = {
      ...layout,
      root: {
        ...layout.root,
        children: [{ ...(layout.root.children[0] as LayoutNode), label: "Hero" }],
      },
    };
    await mountTree(<Live start={labelled} />);
    await act(async () => {
      select("head0001").dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }));
    });
    expect(field()?.value).toBe("Hero");
    await typeName("Other", "Escape");
    expect(renames).toEqual([]);
    expect(select("head0001").textContent).toContain("Hero");
    await clickEl(document.querySelector('[data-emvb-layer="head0001"] .emvb-layer-menu-btn'));
    const rename = [...document.querySelectorAll('[role="menuitem"]')].find(
      (el) => el.textContent === "Rename",
    );
    await clickEl(rename ?? null);
    await typeName("", "Enter");
    expect(renames).toEqual([["head0001", undefined]]);
    expect(select("head0001").textContent).toContain("Heading");
  });

  test("Enter or Escape in the name field returns focus to the row (W-256)", async () => {
    await mountTree(<Live start={layout} />);
    await act(async () => {
      select("head0001").dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }));
    });
    await typeName("Named", "Enter");
    expect(document.activeElement).toBe(select("head0001"));
    await act(async () => {
      select("head0001").dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }));
    });
    await typeName("Ignored", "Escape");
    expect(document.activeElement).toBe(select("head0001"));
  });

  test("leaving the name field by focusing elsewhere keeps focus there (W-256)", async () => {
    await mountTree(<Live start={layout} />);
    await act(async () => {
      select("head0001").dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }));
    });
    await act(async () => {
      select("head0002").focus();
    });
    expect(field()).toBeNull();
    expect(document.activeElement).toBe(select("head0002"));
  });
});
