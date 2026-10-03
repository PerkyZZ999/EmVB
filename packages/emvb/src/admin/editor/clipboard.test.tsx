import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { heading, s1Page } from "../../../test/fixtures/layouts.ts";
import {
  elementClip,
  encodeClip,
  styleClip,
  validateLayout,
  type DesignSystem,
  type Layout,
  type LayoutNode,
} from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { CLIPBOARD_KEY } from "./clipboard-store.ts";
import { Editor } from "./Editor.tsx";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";

const DESIGN: DesignSystem = {
  schemaVersion: 9,
  variables: { colors: [{ id: "brand", name: "Brand", value: "#112233" }] },
  classes: [{ id: "card", name: "Card", style: {} }],
};

/** The page: the S1 heading plus a styled text and a box, so paste has somewhere to go. */
const pageLayout = (): Layout => {
  const layout = s1Page();
  layout.root.children.push(
    {
      id: "text0001",
      type: "text",
      props: { text: "Body" },
      style: {
        backgroundColor: "#eeeeee",
        transition: { duration: 150, easing: "ease", property: "colors" },
      },
      states: { hover: { backgroundColor: "#dddddd" } },
      classes: ["card"],
    },
    { id: "box00001", type: "container", props: {}, children: [] },
  );
  return layout;
};

function fakeServer() {
  const server = {
    rev: 1,
    data: { title: "Pricing", layout: pageLayout() } as Record<string, unknown>,
    puts: [] as Record<string, unknown>[],
  };
  const envelope = () => ({
    data: {
      item: { id: "01PAGE", slug: "pricing", status: "draft", data: server.data, seo: null },
      _rev: `rev${server.rev}`,
    },
  });
  const fetcher: Fetcher = async (path, init) => {
    const method = init?.method ?? "GET";
    const body =
      typeof init?.body === "string"
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : undefined;
    if (path === "/_emdash/api/content/emvb_pages/01PAGE" && method === "GET")
      return Response.json(envelope());
    if (path === "/_emdash/api/content/emvb_pages/01PAGE" && method === "PUT") {
      server.rev += 1;
      server.data = body?.["data"] as Record<string, unknown>;
      server.puts.push(server.data);
      return Response.json(envelope());
    }
    if (path === "/_emdash/api/plugins/emvb/design/draft")
      return Response.json({ data: { design: DESIGN, revision: "d1" } });
    return Response.json({}, { status: 404 });
  };
  return { server, fetcher };
}

async function render() {
  const { server, fetcher } = fakeServer();
  await mount(<Editor fetcher={fetcher} entryId="01PAGE" />);
  for (let i = 0; i < 200 && !document.querySelector(".emvb-save-status"); i++) {
    // oxlint-disable-next-line no-await-in-loop
    await settle();
  }
  return server;
}

afterEach(async () => {
  await cleanup();
  localStorage.clear();
  window.getSelection()?.removeAllRanges();
});

const layerRow = (id: string) =>
  document.querySelector<HTMLElement>(`[data-emvb-layer="${id}"] .emvb-layer-select`);

async function click(element: Element | null | undefined) {
  expect(element?.outerHTML ?? null).not.toBeNull();
  await act(async () => (element as HTMLElement).click());
  await settle();
}

async function openLayers() {
  if (document.querySelector('[data-emvb-panel="layers"]')) return;
  await click(
    [...document.querySelectorAll('[role="tab"]')].find((el) =>
      (el.textContent ?? "").includes("Layers"),
    ),
  );
}

async function select(id: string) {
  await openLayers();
  await click(layerRow(id));
}

/** Sends a key to `target` (the window by default) and says whether the editor took it. */
async function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = window) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  await act(async () => {
    target.dispatchEvent(event);
  });
  await settle();
  return event.defaultPrevented;
}

const stored = () => localStorage.getItem(CLIPBOARD_KEY);
const storedNode = () => (JSON.parse(stored() ?? "null") as { node?: LayoutNode } | null)?.node;
const rootIds = (layout: Layout | undefined) => layout?.root.children.map((n) => n.id) ?? [];

async function saveAndRead(server: { puts: Record<string, unknown>[] }): Promise<Layout> {
  await press("s", { ctrlKey: true });
  await settle();
  const layout = server.puts.at(-1)?.["layout"] as Layout;
  expect(validateLayout(layout).ok).toBe(true);
  return layout;
}

const announced = () => document.querySelector(".emvb-sr-only[aria-live]")?.textContent ?? "";

describe("copy and paste shortcuts (W-093)", () => {
  test("Ctrl+C copies the selected element as a versioned EmVB clip", async () => {
    await render();
    await select("text0001");
    expect(await press("c", { ctrlKey: true })).toBe(true);
    expect(JSON.parse(stored() ?? "null")).toMatchObject({
      format: "emvb-clipboard",
      version: 1,
      schemaVersion: 9,
      kind: "element",
      node: { id: "text0001", type: "text", props: { text: "Body" } },
    });
    expect(announced()).toBe("Text copied");
  });

  test("Cmd+V pastes after the selected element with new ids, and the save holds both", async () => {
    const server = await render();
    await select("text0001");
    await press("c", { metaKey: true });
    await select("head0001");
    expect(await press("v", { metaKey: true })).toBe(true);
    const layout = await saveAndRead(server);
    const ids = rootIds(layout);
    expect(ids).toHaveLength(4);
    expect(ids[0]).toBe("head0001");
    expect(ids.slice(2)).toEqual(["text0001", "box00001"]);
    const pasted = layout.root.children[1];
    expect(pasted?.id).not.toBe("text0001");
    expect(pasted).toEqual({ ...(storedNode() as LayoutNode), id: pasted?.id ?? "" });
    expect(layerRow(pasted?.id ?? "")?.getAttribute("aria-current") ?? null).toBe("true");
  });

  test("shortcuts inside a text field are the field's own: nothing is copied or pasted", async () => {
    const server = await render();
    await select("text0001");
    const input = document.querySelector<HTMLElement>(
      '[data-emvb-panel="element"] input, [data-emvb-panel="element"] textarea',
    );
    expect(input?.outerHTML ?? null).not.toBeNull();
    expect(await press("c", { ctrlKey: true }, input as HTMLElement)).toBe(false);
    expect(stored()).toBeNull();
    localStorage.setItem(CLIPBOARD_KEY, encodeClip(elementClip(heading("head0009", "X"))));
    expect(await press("v", { ctrlKey: true }, input as HTMLElement)).toBe(false);
    expect(await press("v", { ctrlKey: true, shiftKey: true }, input as HTMLElement)).toBe(false);
    expect(rootIds(await saveAndRead(server))).toEqual(["head0001", "text0001", "box00001"]);
  });

  test("with text selected on the page, Ctrl+C copies the text, not the element", async () => {
    await render();
    await select("text0001");
    const range = document.createRange();
    range.selectNodeContents(layerRow("text0001") as HTMLElement);
    window.getSelection()?.addRange(range);
    expect(window.getSelection()?.toString().length ?? 0).toBeGreaterThan(0);
    expect(await press("c", { ctrlKey: true })).toBe(false);
    expect(stored()).toBeNull();
  });

  test("Ctrl+Shift+V pastes the copied style, with states and transition, but not classes", async () => {
    const server = await render();
    localStorage.setItem(
      CLIPBOARD_KEY,
      encodeClip(styleClip(pageLayout().root.children[1] as LayoutNode)),
    );
    await select("head0001");
    expect(await press("V", { ctrlKey: true, shiftKey: true })).toBe(true);
    const layout = await saveAndRead(server);
    expect(layout.root.children[0]).toEqual({
      id: "head0001",
      type: "heading",
      props: { text: "Welcome", level: 1 },
      style: {
        backgroundColor: "#eeeeee",
        transition: { duration: 150, easing: "ease", property: "colors" },
      },
      states: { hover: { backgroundColor: "#dddddd" } },
    });
    expect(announced()).toBe("Style pasted on Heading");
  });

  test("a paste the drop rules refuse changes nothing and shows the reason on the target", async () => {
    const server = await render();
    localStorage.setItem(
      CLIPBOARD_KEY,
      encodeClip(elementClip({ id: "inpt0001", type: "text-input", props: { field: "email" } })),
    );
    await select("head0001");
    await press("v", { ctrlKey: true });
    expect(announced()).toBe("Form fields must be placed inside a form.");
    const label = document.querySelector("[data-emvb-invalid-label]");
    expect(label?.textContent ?? null).toBe("Form fields must be placed inside a form.");
    expect(rootIds(await saveAndRead(server))).toEqual(["head0001", "text0001", "box00001"]);
    await select("text0001");
    expect(document.querySelector("[data-emvb-invalid-label]")?.outerHTML ?? null).toBeNull();
  });

  test("classes and variables the site doesn't have are dropped with a notice", async () => {
    const server = await render();
    const node: LayoutNode = {
      ...heading("head0009", "Copied", 2),
      classes: ["card", "elsewhere"],
      style: { color: { var: "missing" } },
    };
    localStorage.setItem(CLIPBOARD_KEY, encodeClip(elementClip(node)));
    await select("box00001");
    await press("v", { ctrlKey: true });
    expect(document.body.textContent).toContain(
      "Left out 1 class and 1 variable. Classes and variables this site doesn't have were removed.",
    );
    const layout = await saveAndRead(server);
    const pasted = layout.root.children[3];
    expect(pasted?.classes).toEqual(["card"]);
    expect(pasted?.style).toBeUndefined();
  });

  test("a copy made in another tab is picked up for the menus", async () => {
    await render();
    await openLayers();
    await click(document.querySelector('[data-emvb-layer="head0001"] .emvb-layer-menu-btn'));
    const paste = () =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
        (el) => el.textContent === "Paste",
      );
    expect(paste()?.disabled ?? null).toBe(true);
    await act(async () => {
      localStorage.setItem(CLIPBOARD_KEY, encodeClip(elementClip(heading("head0009"))));
      window.dispatchEvent(new StorageEvent("storage", { key: CLIPBOARD_KEY }));
    });
    expect(paste()?.disabled ?? null).toBe(false);
  });
});
