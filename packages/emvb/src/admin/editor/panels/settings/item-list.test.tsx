import { afterEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import {
  emptyDesign,
  findNode,
  renderPage,
  validateLayout,
  type Layout,
  type LayoutNode,
} from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { revealInAccordions } from "../../canvas/tab-reveal.ts";
import { newElement } from "../../dnd/new-element.ts";
import { ElementPanel } from "../ElementPanel.tsx";
import type { ItemActions } from "./ItemList.tsx";
import { cleanup, mount, rerender } from "../../../../../test/dom/mount.ts";

const stubFetcher: Fetcher = async () => new Response("{}", { status: 200 });

afterEach(async () => {
  await cleanup();
  sessionStorage.clear();
});

const text = (id: string, value: string): LayoutNode => ({
  id,
  type: "text",
  props: { text: value },
});
const item = (id: string, summary: string, children: LayoutNode[] = [], open?: boolean) =>
  ({
    id,
    type: "accordion-item",
    props: open ? { summary, open } : { summary },
    children,
  }) as LayoutNode;
const tabPanel = (id: string, label: string): LayoutNode => ({
  id,
  type: "tab-panel",
  props: { label },
  children: [],
});

const accordion = (children: LayoutNode[]): LayoutNode =>
  ({ id: "acc00001", type: "accordion", props: {}, children }) as LayoutNode;

const layoutWith = (node: LayoutNode): Layout => ({
  schemaVersion: 10,
  root: { id: "root0001", type: "container", props: {}, children: [node] },
});

type Calls = { changed: LayoutNode[]; selected: (string | null)[]; ran: string[] };

async function panel(node: LayoutNode, actions?: ItemActions): Promise<Calls> {
  const calls: Calls = { changed: [], selected: [], ran: [] };
  await mount(
    <ElementPanel
      node={node}
      layout={layoutWith(node)}
      design={emptyDesign()}
      rejection={null}
      fetcher={stubFetcher}
      onChange={(next) => calls.changed.push(next)}
      onDesignChange={async () => undefined}
      onSelect={(id) => calls.selected.push(id)}
      items={actions}
    />,
  );
  return calls;
}

const button = (name: string) => {
  const found = [...document.querySelectorAll("button")].find(
    (b) => b.getAttribute("aria-label") === name || b.textContent?.trim() === name,
  );
  if (!found) throw new Error(`no button ${name}`);
  return found;
};

const inputLabelled = (label: string) => {
  const found = [...document.querySelectorAll("label")].find(
    (l) => l.textContent?.trim() === label,
  );
  const id = found?.getAttribute("for");
  const input = id ? document.getElementById(id) : found?.querySelector("input");
  if (!(input instanceof HTMLInputElement)) throw new Error(`no input labelled ${label}`);
  return input;
};

const type = async (input: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

const kidsOf = (node: LayoutNode | undefined): LayoutNode[] =>
  node && "children" in node ? ((node.children ?? []) as LayoutNode[]) : [];
const childIds = (node: LayoutNode | undefined) => kidsOf(node).map((c) => c.id);

describe("Accordion and Tabs item editing (W-130)", () => {
  test("a new Accordion starts with three items, the first open, each holding a Text", () => {
    const node = newElement("accordion");
    if (!node || node.type !== "accordion") throw new Error("expected an accordion");
    const summary = (c: LayoutNode) => c.props as { summary?: string; open?: boolean };
    expect(kidsOf(node).map((c) => [summary(c).summary, summary(c).open ?? false])).toEqual([
      ["Question 1", true],
      ["Question 2", false],
      ["Question 3", false],
    ]);
    expect(kidsOf(node).map((c) => kidsOf(c).map((k) => k.type))).toEqual([
      ["text"],
      ["text"],
      ["text"],
    ]);
    expect(validateLayout(layoutWith(node)).ok).toBe(true);
  });

  test("a saved Accordion with no items still validates, renders, and lists no items", async () => {
    const empty = accordion([]);
    expect(validateLayout(layoutWith(empty)).ok).toBe(true);
    expect(renderPage(layoutWith(empty), emptyDesign()).html).toContain("emvb-accordion");
    await panel(empty);
    expect(document.querySelector("[data-emvb-item-empty]")?.textContent).toContain("No items yet");
    expect(document.body.textContent).not.toContain("no content settings");
    expect(button("Add item").disabled).toBe(false);
  });

  test("the list names each item; editing a title changes only that item", async () => {
    const node = accordion([item("itm00001", "First"), item("itm00002", "Second")]);
    const calls = await panel(node);
    expect(inputLabelled("Item 1 title").value).toBe("First");
    await type(inputLabelled("Item 2 title"), "Pricing");
    const next = calls.changed.at(-1);
    if (next?.type !== "accordion") throw new Error("expected an accordion change");
    expect(kidsOf(next).map((c) => (c.props as { summary?: string }).summary)).toEqual([
      "First",
      "Pricing",
    ]);
  });

  test("Edit selects the item; Add, Move and Delete go through the editor's actions", async () => {
    const node = accordion([item("itm00001", "First"), item("itm00002", "Second")]);
    const ran: string[] = [];
    const added: LayoutNode[] = [];
    const calls = await panel(node, {
      add: (parentId, child) => {
        ran.push(`add ${parentId}`);
        added.push(child);
      },
      remove: (id) => ran.push(`remove ${id}`),
      move: (id, direction) => ran.push(`move ${id} ${direction}`),
    });
    await act(async () => button("Edit item 2").click());
    expect(calls.selected).toEqual(["itm00002"]);
    expect(button("Move item 1 up").disabled).toBe(true);
    expect(button("Move item 2 down").disabled).toBe(true);
    await act(async () => button("Move item 2 up").click());
    await act(async () => button("Move item 1 down").click());
    await act(async () => button("Delete item 1").click());
    await act(async () => button("Add item").click());
    expect(ran).toEqual([
      "move itm00002 up",
      "move itm00001 down",
      "remove itm00001",
      "add acc00001",
    ]);
    const fresh = added[0];
    if (fresh?.type !== "accordion-item") throw new Error("expected a new accordion item");
    expect(fresh.props.summary).toBe("Question 3");
    expect(kidsOf(fresh).map((c) => c.type)).toEqual(["text"]);
    expect(calls.changed).toEqual([]);
  });

  test("Add item focuses the new title with its text selected (W-154)", async () => {
    function Live() {
      const [node, setNode] = React.useState(accordion([item("itm00001", "First")]));
      return (
        <ElementPanel
          node={node}
          layout={layoutWith(node)}
          design={emptyDesign()}
          rejection={null}
          fetcher={stubFetcher}
          onChange={setNode}
          onDesignChange={async () => undefined}
          onSelect={() => undefined}
        />
      );
    }
    await mount(<Live />);
    await act(async () => button("Add item").click());
    const title = inputLabelled("Item 2 title");
    expect(title.value).toBe("Question 2");
    expect(document.activeElement).toBe(title);
    expect([title.selectionStart, title.selectionEnd]).toEqual([0, "Question 2".length]);
  });

  test("without editor actions the list edits the parent directly", async () => {
    const node = accordion([item("itm00001", "First"), item("itm00002", "Second")]);
    const calls = await panel(node);
    await act(async () => button("Move item 2 up").click());
    expect(childIds(calls.changed.at(-1))).toEqual(["itm00002", "itm00001"]);
    await act(async () => button("Delete item 1").click());
    expect(childIds(calls.changed.at(-1))).toEqual(["itm00002"]);
    await act(async () => button("Add item").click());
    expect(childIds(calls.changed.at(-1))).toHaveLength(3);
  });

  test("Tabs list their labels and stop adding at 12 tabs", async () => {
    const two = {
      id: "tabs0001",
      type: "tabs",
      props: {},
      children: [tabPanel("tab00001", "One"), tabPanel("tab00002", "Two")],
    } as LayoutNode;
    const calls = await panel(two);
    expect(inputLabelled("Tab 2 label").value).toBe("Two");
    await act(async () => button("Add tab").click());
    const next = calls.changed.at(-1);
    if (next?.type !== "tabs") throw new Error("expected a tabs change");
    expect(kidsOf(next).map((c) => (c.props as { label?: string }).label)).toEqual([
      "One",
      "Two",
      "Tab 3",
    ]);

    const twelve = {
      ...two,
      children: Array.from({ length: 12 }, (_, i) => tabPanel(`tab000${10 + i}`, `T${i + 1}`)),
    } as LayoutNode;
    await rerender(
      <ElementPanel
        key="twelve"
        node={twelve}
        layout={layoutWith(twelve)}
        design={emptyDesign()}
        rejection={null}
        fetcher={stubFetcher}
        onChange={() => undefined}
        onDesignChange={async () => undefined}
        onSelect={() => undefined}
      />,
    );
    expect(button("Add tab").disabled).toBe(true);
    expect(document.body.textContent).toContain("up to 12 tabs");
  });

  test("an accordion item and a tab panel explain where their content goes", async () => {
    await panel(item("itm00001", "First"));
    expect(document.body.textContent).toContain("elements in its body");
    await cleanup();
    await panel(tabPanel("tab00001", "One"));
    expect(document.body.textContent).toContain("elements in its panel");
  });
});

describe("opening the accordion item that holds the selection (W-130)", () => {
  const layout = layoutWith(
    accordion([
      item("itm00001", "First", [text("txt00001", "One")]),
      item("itm00002", "Second", [text("txt00002", "Two")]),
      item("itm00003", "Third", [text("txt00003", "Three")], true),
    ]),
  );
  const load = () => {
    document.body.innerHTML = renderPage(layout, emptyDesign(), { mode: "editor" }).html;
  };
  const open = () =>
    [...document.querySelectorAll<HTMLDetailsElement>("details")].map((d) => d.open);
  const saved = (id: string) => findNode(layout, id)?.props["open" as never] === true;

  test("selecting inside a closed item opens it; selecting elsewhere closes it again", () => {
    load();
    expect(open()).toEqual([false, false, true]);
    revealInAccordions(document, "txt00002", saved);
    expect(open()).toEqual([false, true, true]);
    revealInAccordions(document, "itm00001", saved);
    expect(open()).toEqual([true, false, true]);
    revealInAccordions(document, null, saved);
    expect(open()).toEqual([false, false, true]);
  });

  test("an item saved as open stays open when the selection leaves", () => {
    load();
    revealInAccordions(document, "txt00003", saved);
    revealInAccordions(document, "txt00001", saved);
    expect(open()).toEqual([true, false, true]);
    // Open switched on while the item was held open for the selection: it stays open.
    revealInAccordions(document, "txt00002", saved);
    revealInAccordions(document, null, (id) => id === "itm00002" || saved(id));
    expect(open()).toEqual([false, true, true]);
  });
});
