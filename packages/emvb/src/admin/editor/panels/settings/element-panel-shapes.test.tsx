import { afterEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import { ELEMENTS, emptyDesign, type Layout, type LayoutNode } from "../../../../core/index.ts";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import type { Fetcher } from "../../../api.ts";
import { newElement } from "../../dnd/new-element.ts";
import { ElementPanel } from "../ElementPanel.tsx";

// Recorded from ElementPanel before W-086 M16 split it into smaller pieces.
const stubFetcher: Fetcher = async () => new Response("{}", { status: 200 });

afterEach(async () => {
  await cleanup();
  sessionStorage.clear();
});

const ALL_SECTIONS = ["layout", "spacing", "typography", "background", "border", "advanced"];

const KEPT =
  /^(data-|aria-|role$|type$|name$|value$|placeholder$|href$|disabled$|checked$|for$|id$|tabindex$)/;

/**
 * The panel as an indented outline: tags, behaviour attributes, EmVB classes and text. Kumo's
 * utility classes, icon paths and the inside of each style row are left out; generated ids are numbered by first appearance.
 */
function outline(host: HTMLElement) {
  const ids = new Map<string, string>();
  const stable = (value: string) =>
    value.replace(/base-ui-[\w-]+|«[^»]*»|:r[0-9a-z]+:|_r_[0-9a-z]+_/g, (id) => {
      if (!ids.has(id)) ids.set(id, `id-${ids.size}`);
      return ids.get(id) ?? id;
    });
  const lines: string[] = [];
  const walk = (node: Node, depth: number) => {
    const pad = "  ".repeat(depth);
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) lines.push(`${pad}"${text}"`);
      return;
    }
    if (!(node instanceof Element)) return;
    const own = [...node.classList].filter((name) => name.startsWith("emvb-"));
    const attrs = [...node.attributes]
      .filter((attr) => KEPT.test(attr.name))
      .map((attr) => `${attr.name}="${stable(attr.value)}"`);
    const tag = [node.tagName.toLowerCase(), ...own.map((name) => `.${name}`)].join("");
    lines.push(`${pad}${[tag, ...attrs].join(" ")}`);
    // StyleRow has its own tests; here only which rows appear, and in what order, matters.
    if (node.tagName.toLowerCase() === "svg" || own.includes("emvb-style-row")) return;
    for (const child of node.childNodes) walk(child, depth + 1);
  };
  for (const child of host.childNodes) walk(child, 0);
  return lines.join("\n");
}

function seeded() {
  let n = 0;
  return () => ((n = (n * 7 + 3) % 97), n / 97);
}

async function panelFor(
  node: LayoutNode,
  extra: { rejection?: string; formsAvailable?: boolean; sections?: string[] } = {},
) {
  const layout: Layout = {
    schemaVersion: 10,
    root: { id: "root0001", type: "container", props: {}, children: [node] },
  };
  localStorage.setItem(
    `emvb-style-sections:${node.type}`,
    JSON.stringify(extra.sections ?? ALL_SECTIONS),
  );
  const host = await mount(
    <ElementPanel
      node={node}
      layout={layout}
      design={emptyDesign()}
      rejection={extra.rejection ?? null}
      fetcher={stubFetcher}
      formsAvailable={extra.formsAvailable ?? true}
      onChange={() => undefined}
      onDesignChange={async () => undefined}
      onSelect={() => undefined}
    />,
  );
  const content = outline(host);
  const styleTab = [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find((tab) =>
    tab.textContent?.includes("Style"),
  );
  await act(async () => styleTab?.click());
  return { content, style: outline(host) };
}

describe("element panel markup (W-021, W-086 M16)", () => {
  for (const type of Object.keys(ELEMENTS)) {
    test(`${type} renders the same content and style tabs`, async () => {
      const node = newElement(type, seeded());
      expect(node).not.toBeNull();
      const styled = { ...(node as LayoutNode), htmlId: "hero", classes: ["card"] };
      expect(
        await panelFor(styled, { formsAvailable: false, rejection: "Can't go there." }),
      ).toMatchSnapshot();
    });
  }

  test("closed sections count the properties set in them", async () => {
    const node = {
      id: "head0001",
      type: "heading",
      props: { text: "Hi", level: 2 },
      htmlId: "top",
      style: {
        paddingTop: { value: 4, unit: "px" },
        paddingLeft: { value: 8, unit: "px" },
        marginTop: { value: 2, unit: "px" },
        fontSize: { value: 18, unit: "px" },
      },
    } as LayoutNode;
    expect((await panelFor(node, { sections: [] })).style).toMatchSnapshot();
  });

  test("an unknown element renders its notice", async () => {
    const node = { id: "zzzz0001", type: "mystery", props: {} } as unknown as LayoutNode;
    expect(await panelFor(node, { rejection: "Can't go there." })).toMatchSnapshot();
  });

  test("selecting a known element after an unknown one shows its settings", async () => {
    const unknown = { id: "zzzz0001", type: "mystery", props: {} } as unknown as LayoutNode;
    const heading: LayoutNode = {
      id: "head0001",
      type: "heading",
      props: { text: "Hi", level: 2 },
    };
    let select: (node: LayoutNode) => void = () => undefined;
    function Selection() {
      const [node, setNode] = React.useState(unknown);
      select = setNode;
      return (
        <ElementPanel
          node={node}
          layout={null}
          design={emptyDesign()}
          rejection={null}
          fetcher={stubFetcher}
          onChange={() => undefined}
          onDesignChange={async () => undefined}
          onSelect={() => undefined}
        />
      );
    }
    const host = await mount(<Selection />);
    expect(host.textContent).toContain("Unknown element");
    await act(async () => select(heading));
    expect(
      host.querySelector('[data-emvb-element="heading"] [data-emvb-tab="content"]'),
    ).toBeTruthy();
    await act(async () => select(unknown));
    expect(host.textContent).toContain("Unknown element");
  });
});
