import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { heading, layoutOfBytes, s1Page } from "../../../test/fixtures/layouts.ts";
import { byteLength, MAX_LAYOUT_BYTES, type DesignSystem } from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { Editor } from "./Editor.tsx";
import { tooLargeMessage } from "./useSave.ts";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";

async function render(fetcher: Fetcher) {
  await mount(<Editor fetcher={fetcher} entryId="01PAGE" />);
  for (let i = 0; i < 200 && !document.querySelector(".emvb-save-status"); i++) {
    // Loading is sequential by nature: each tick lets the fake API and React move on.
    // oxlint-disable-next-line no-await-in-loop
    await settle();
  }
}

afterEach(cleanup);

type Call = { method: string; path: string; body: Record<string, unknown> | undefined };

const DESIGN: DesignSystem = {
  schemaVersion: 7,
  variables: { colors: [{ id: "brand", name: "Brand", value: "#112233" }] },
};

/** A stateful stand-in for EmDash's content API and EmVB's design routes. */
function fakeServer(options: { layout?: unknown; takenSlug?: string; rejectText?: string } = {}) {
  const calls: Call[] = [];
  const server = {
    rev: 1,
    data: {
      title: "Pricing",
      layout: "layout" in options ? options.layout : s1Page(),
    } as Record<string, unknown>,
    slug: "pricing",
    designRevision: "d1" as string | null,
    calls,
  };
  const envelope = () => ({
    data: {
      item: { id: "01PAGE", slug: server.slug, status: "draft", data: server.data, seo: null },
      _rev: `rev${server.rev}`,
    },
  });
  const fetcher: Fetcher = async (path, init) => {
    const method = init?.method ?? "GET";
    const body =
      typeof init?.body === "string"
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : undefined;
    calls.push({ method, path, body });
    const fail = (status: number, code: string, message: string) =>
      Response.json({ error: { code, message } }, { status });
    if (path === "/_emdash/api/content/emvb_pages/01PAGE" && method === "GET") {
      return Response.json(envelope());
    }
    if (path === "/_emdash/api/content/emvb_pages/01PAGE" && method === "PUT") {
      if (body?.["_rev"] !== `rev${server.rev}`) return fail(409, "CONFLICT", "Stale revision");
      if (body?.["slug"] === options.takenSlug) return fail(409, "SLUG_CONFLICT", "Slug taken");
      if (options.rejectText && JSON.stringify(body?.["data"]).includes(options.rejectText)) {
        return fail(
          422,
          "SAVE_REJECTED",
          "The page layout is invalid. root.children[0].props.text: Too long",
        );
      }
      server.rev += 1;
      server.data = body?.["data"] as Record<string, unknown>;
      server.slug = String(body?.["slug"]);
      return Response.json(envelope());
    }
    if (path === "/_emdash/api/content/emvb_pages/01PAGE/publish") {
      if (body?.["_rev"] !== `rev${server.rev}`) return fail(409, "CONFLICT", "Stale revision");
      server.rev += 1;
      return Response.json(envelope());
    }
    if (path === "/_emdash/api/plugins/emvb/design/draft") {
      return Response.json({ data: { design: DESIGN, revision: server.designRevision } });
    }
    if (path === "/_emdash/api/plugins/emvb/design/save") {
      server.designRevision = "d2";
      return Response.json({ data: { revision: "d2" } });
    }
    return Response.json({}, { status: 404 });
  };
  return { server, fetcher };
}

const editor = () => document.querySelector<HTMLElement>("[data-emvb-editor]");
const button = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === name,
  );
const field = (label: string) => {
  const element = [...document.querySelectorAll("label")].find((l) =>
    l.textContent?.trim().startsWith(label),
  );
  const id = element?.getAttribute("for");
  return (id ? document.getElementById(id) : null) as HTMLInputElement | null;
};

async function click(element: Element | null | undefined) {
  expect(element).toBeTruthy();
  await act(async () => (element as HTMLElement).click());
  await settle();
}

async function type(input: HTMLInputElement | null, value: string) {
  expect(input).toBeTruthy();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function press(key: string, init: KeyboardEventInit = {}) {
  await act(async () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
    );
  });
  await settle();
  await settle();
}

const puts = (calls: Call[]) => calls.filter((c) => c.method === "PUT");
const saveStatus = () => editor()?.querySelector(".emvb-save-status")?.textContent ?? "";
const layerRow = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>(".emvb-layer-select")].find((row) =>
    row.textContent?.startsWith(name),
  );

const openLayers = async () => {
  if (document.querySelector('[data-emvb-panel="layers"]')) return;
  const tab = [...document.querySelectorAll('[role="tab"]')].find((el) =>
    (el.textContent ?? "").includes("Layers"),
  );
  await click(tab);
};

describe("save draft (R-006)", () => {
  test("saves with _rev, the edited page and SEO, and the next save uses the new revision", async () => {
    const { server, fetcher } = fakeServer();
    await render(fetcher);
    await type(field("Title"), "Pricing plans");
    expect(button("Save draft (unsaved changes)")).toBeTruthy();
    await press("s", { ctrlKey: true });
    const [first] = puts(server.calls);
    expect(first?.body).toMatchObject({
      _rev: "rev1",
      slug: "pricing",
      data: { title: "Pricing plans", layout: s1Page(), canvas_mode: "site-layout" },
      seo: { title: null, description: null },
    });
    expect(saveStatus()).toBe("Saved");
    expect(button("Save draft")).toBeTruthy();
    await type(field("Title"), "Plans");
    await click(button("Save draft (unsaved changes)"));
    expect(puts(server.calls)[1]?.body?.["_rev"]).toBe("rev2");
  });

  test("a concurrent change opens the conflict dialog and nothing is overwritten until chosen", async () => {
    const { server, fetcher } = fakeServer();
    await render(fetcher);
    server.rev = 5;
    await type(field("Title"), "Mine");
    await press("s", { ctrlKey: true });
    expect(document.body.textContent).toContain("This page was changed somewhere else");
    expect(server.data["title"]).toBe("Pricing");
    await click(button("Overwrite"));
    expect(puts(server.calls).at(-1)?.body?.["_rev"]).toBe("rev5");
    expect(server.data["title"]).toBe("Mine");
  });

  test("a layout grown past the size limit shows the size error and sends nothing", async () => {
    const layout = layoutOfBytes(MAX_LAYOUT_BYTES - 1100);
    layout.root.children.push(heading("hlast001", "x".repeat(900), 2));
    expect(byteLength(layout)).toBeLessThan(MAX_LAYOUT_BYTES);
    const { server, fetcher } = fakeServer({ layout });
    await render(fetcher);
    await openLayers();
    const rows = document.querySelectorAll(".emvb-layer-select");
    await click(rows[rows.length - 1]);
    const grown = "x".repeat(900) + "y".repeat(300);
    await type(field("Text"), grown);
    await press("s", { ctrlKey: true });
    const bytes = byteLength(layout) + 300;
    expect(bytes).toBeGreaterThan(MAX_LAYOUT_BYTES);
    expect(saveStatus()).toContain(tooLargeMessage(bytes));
    expect(puts(server.calls)).toHaveLength(0);
  });

  test("a duplicate slug shows an inline error on the Slug field", async () => {
    const { fetcher } = fakeServer({ takenSlug: "home" });
    await render(fetcher);
    await type(field("Slug"), "home");
    await press("s", { ctrlKey: true });
    expect(editor()?.textContent).toContain(
      'A page with the slug "home" already exists. Choose a different slug.',
    );
  });

  test("a rejected layout selects the element at fault and shows why", async () => {
    const { fetcher } = fakeServer({ rejectText: "Welcome" });
    await render(fetcher);
    await type(field("Title"), "Changed");
    await press("s", { ctrlKey: true });
    expect(saveStatus()).toContain("Fix the highlighted setting");
    const panel = editor()?.querySelector('[data-emvb-panel="element"]');
    expect(panel?.getAttribute("data-emvb-element")).toBe("heading");
    expect(panel?.textContent).toContain("root.children[0].props.text: Too long");
  });

  test("publish saves pending changes first, then publishes that revision", async () => {
    const { server, fetcher } = fakeServer();
    await render(fetcher);
    await type(field("Title"), "Launch");
    await click(button("Publish"));
    await settle();
    const publish = server.calls.find((c) => c.path.endsWith("/publish"));
    expect(puts(server.calls)).toHaveLength(1);
    expect(publish?.body?.["_rev"]).toBe("rev2");
    expect(editor()?.querySelector(".emvb-status")?.textContent).toBe("Published");
  });
});

describe("page settings (D-025)", () => {
  test("the SEO section is closed by default and opens on demand", async () => {
    const { fetcher } = fakeServer();
    await render(fetcher);
    expect(field("Meta title")?.outerHTML ?? null).toBeNull();
    await click(editor()?.querySelector('[data-emvb-section="seo"]'));
    expect(field("Meta title")).toBeTruthy();
  });
});

describe("delete and restore (D-025)", () => {
  test("Delete removes the selected element, and Restore puts it back in place, selected", async () => {
    const { fetcher } = fakeServer();
    await render(fetcher);
    await openLayers();
    await click(layerRow("Heading"));
    await press("Delete");
    expect(layerRow("Heading")?.outerHTML).toBeUndefined();
    expect(document.body.textContent).toContain("Element deleted");
    await click(button("Restore"));
    expect(layerRow("Heading")?.getAttribute("aria-current")).toBe("true");
    expect(editor()?.querySelector('[data-emvb-panel="element"]')).toBeTruthy();
  });

  test("Delete in a text field edits the text, not the page", async () => {
    const { fetcher } = fakeServer();
    await render(fetcher);
    await openLayers();
    await click(layerRow("Heading"));
    const input = field("Text");
    await act(async () => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    });
    expect(layerRow("Heading")).toBeTruthy();
  });

  test("the root container can't be deleted", async () => {
    const { fetcher } = fakeServer();
    await render(fetcher);
    await openLayers();
    await click(layerRow("Container"));
    await press("Delete");
    expect(layerRow("Container")).toBeTruthy();
  });
});

describe("colour variables (R-004 partial)", () => {
  test("creating a variable saves the design with its revision and binds the heading to it", async () => {
    const { server, fetcher } = fakeServer();
    await render(fetcher);
    await openLayers();
    await click(layerRow("Heading"));
    await click(
      [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent === "Style"),
    );
    await click(button("New variable"));
    await type(field("Variable name"), "Accent Blue");
    await type(field("Value"), "#0055ff");
    await click(button("Create variable"));
    const save = server.calls.find((c) => c.path.endsWith("/design/save"));
    expect(save?.body).toEqual({
      design: {
        schemaVersion: 7,
        variables: {
          colors: [
            ...DESIGN.variables.colors,
            { id: "accent-blue", name: "Accent Blue", value: "#0055ff" },
          ],
        },
      },
      revision: "d1",
    });
    await press("s", { ctrlKey: true });
    const layout = puts(server.calls)[0]?.body?.["data"] as { layout: ReturnType<typeof s1Page> };
    expect(layout.layout.root.children[0]?.style?.color).toEqual({ var: "accent-blue" });
  });
});

describe("Add panel and Layers (W-018)", () => {
  test("click-add inserts at the insertion point and announces it", async () => {
    const layout = {
      schemaVersion: 1 as const,
      root: {
        id: "root0001",
        type: "container" as const,
        props: {},
        children: [
          {
            id: "box00001",
            type: "container" as const,
            props: {},
            children: [],
          },
        ],
      },
    };
    const { server, fetcher } = fakeServer({ layout });
    await render(fetcher);
    await openLayers();
    await click(document.querySelector('[data-emvb-layer="box00001"] .emvb-layer-select'));
    const addTab = [...document.querySelectorAll('[role="tab"]')].find((el) =>
      (el.textContent ?? "").includes("Add"),
    );
    await click(addTab);
    await click(document.querySelector('[data-emvb-add-tile="heading"]'));
    expect(editor()?.querySelector(".emvb-sr-only")?.textContent).toBe(
      "Heading added inside Container",
    );
    await openLayers();
    expect(document.querySelector('[data-emvb-layer="box00001"]')).toBeTruthy();
    // Nested heading should exist under the box after save
    await press("s", { ctrlKey: true });
    const saved = server.data["layout"] as {
      root: { children: Array<{ type: string; children?: Array<{ type: string }> }> };
    };
    const box = saved.root.children[0];
    expect(box?.type === "container" && box.children?.[0]?.type).toBe("heading");
  });

  test("an empty page shows Add a container to start", async () => {
    const { fetcher } = fakeServer({ layout: null });
    await render(fetcher);
    expect(editor()?.textContent).toContain("Add a container to start");
    await click(button("Add a container to start"));
    await openLayers();
    expect(layerRow("Container")).toBeTruthy();
  });
});

describe("keyboard and quick actions (W-020)", () => {
  test("Alt+ArrowDown moves the selected heading down among siblings", async () => {
    const layout = {
      schemaVersion: 1 as const,
      root: {
        id: "root0001",
        type: "container" as const,
        props: {},
        children: [
          { id: "head0001", type: "heading" as const, props: { text: "A", level: 1 } },
          { id: "head0002", type: "heading" as const, props: { text: "B", level: 2 } },
        ],
      },
    };
    const { server, fetcher } = fakeServer({ layout });
    await render(fetcher);
    await openLayers();
    await click(document.querySelector('[data-emvb-layer="head0001"] .emvb-layer-select'));
    await settle();
    await press("ArrowDown", { altKey: true });
    await settle();
    await press("s", { ctrlKey: true });
    const saved = server.data["layout"] as {
      root: { children: Array<{ props?: { text?: string } }> };
    };
    expect(saved.root.children.map((c) => c.props?.text)).toEqual(["B", "A"]);
  });

  test("↑/↓ walk document order; Enter enters a container and Shift+Enter leaves it", async () => {
    const layout = {
      schemaVersion: 1 as const,
      root: {
        id: "root0001",
        type: "container" as const,
        props: {},
        children: [
          { id: "head0001", type: "heading" as const, props: { text: "A", level: 1 } },
          {
            id: "box00001",
            type: "container" as const,
            props: {},
            children: [
              { id: "head0002", type: "heading" as const, props: { text: "B", level: 2 } },
            ],
          },
        ],
      },
    };
    const { fetcher } = fakeServer({ layout });
    await render(fetcher);
    await openLayers();
    await click(document.querySelector('[data-emvb-layer="head0001"] .emvb-layer-select'));
    const current = () =>
      document
        .querySelector('[aria-current="true"]')
        ?.closest("[data-emvb-layer]")
        ?.getAttribute("data-emvb-layer");
    await press("ArrowDown");
    expect(current()).toBe("box00001");
    await press("Enter");
    expect(current()).toBe("head0002");
    await press("Enter", { shiftKey: true });
    expect(current()).toBe("box00001");
    await press("ArrowUp");
    expect(current()).toBe("head0001");
  });

  test("Ctrl+D does not duplicate while a text field is focused", async () => {
    const { server, fetcher } = fakeServer();
    await render(fetcher);
    await openLayers();
    await click(layerRow("Heading"));
    const input = field("Text");
    await act(async () => {
      input?.focus();
      input?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "d", ctrlKey: true, bubbles: true, cancelable: true }),
      );
    });
    await settle();
    await openLayers();
    expect(document.querySelectorAll(".emvb-layer-row").length).toBe(2);
    void server;
  });

  test("deleting a container with children opens the subtree dialog", async () => {
    const layout = {
      schemaVersion: 1 as const,
      root: {
        id: "root0001",
        type: "container" as const,
        props: {},
        children: [
          {
            id: "box00001",
            type: "container" as const,
            props: {},
            children: [
              { id: "head0001", type: "heading" as const, props: { text: "In", level: 2 } },
            ],
          },
        ],
      },
    };
    const { fetcher } = fakeServer({ layout });
    await render(fetcher);
    await openLayers();
    await click(document.querySelector('[data-emvb-layer="box00001"] .emvb-layer-select'));
    await settle();
    await press("Delete");
    await settle();
    expect(document.body.textContent).toContain("Delete Container and the 1 element inside it?");
    expect(document.querySelector('[data-emvb-dialog="delete-subtree"]')).toBeTruthy();
  });
});
