import { outline as emvbOutline } from "../../../../../test/dom/outline.ts";
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

/** StyleRow has its own tests; here only which rows appear, and in what order, matters. */
const outline = (host: HTMLElement) =>
  emvbOutline(host, {
    stopAt: (node) =>
      node.tagName.toLowerCase() === "svg" || node.classList.contains("emvb-style-row"),
  });

function seeded() {
  let n = 0;
  return () => ((n = (n * 7 + 3) % 97), n / 97);
}

async function panelFor(
  node: LayoutNode,
  extra: { rejection?: string; formsAvailable?: boolean; sections?: string[] } = {},
) {
  const layout: Layout = {
    schemaVersion: 18,
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
