import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { Layout, LayoutNode } from "../../../core/index.ts";
import { LayersPanel } from "./LayersPanel.tsx";
import { cleanup, mount, rerender } from "../../../../test/dom/mount.ts";

afterEach(cleanup);

/** Headings whose `props` reads are counted: a row reads them each time it renders (its preview). */
function countedLayout(count: number): { layout: Layout; reads: () => number } {
  let reads = 0;
  const heading = (i: number): LayoutNode => {
    const props = { text: `Heading ${i}`, level: 2 };
    return {
      id: `head${String(i).padStart(4, "0")}`,
      type: "heading",
      get props() {
        reads += 1;
        return props;
      },
    } as LayoutNode;
  };
  const layout: Layout = {
    schemaVersion: 14,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: Array.from({ length: count }, (_, i) => heading(i)),
    },
  };
  return { layout, reads: () => reads };
}

const noop = () => {};

describe("W-268 Layers rows are memoized", () => {
  test("moving the selection re-renders the two rows involved, not every row", async () => {
    const { layout, reads } = countedLayout(60);
    const panel = (selectedId: string, onSelect: (id: string) => void = noop) => (
      <LayersPanel
        layout={layout}
        selectedId={selectedId}
        onSelect={onSelect}
        onDuplicate={noop}
        onMoveUp={noop}
        onMoveDown={noop}
        onDelete={noop}
      />
    );
    await mount(panel("head0001"));
    const before = reads();
    expect(before).toBeGreaterThanOrEqual(60);
    await rerender(panel("head0002"));
    // Two rows changed (old and new selection); each reads its props a few times at most.
    expect(reads() - before).toBeLessThanOrEqual(8);
  });

  test("a row that didn't re-render still calls the latest onSelect", async () => {
    const { layout } = countedLayout(5);
    const calls: string[] = [];
    const panel = (tag: string) => (
      <LayersPanel
        layout={layout}
        selectedId="head0001"
        onSelect={(id) => calls.push(`${tag}:${id}`)}
        onDuplicate={noop}
        onMoveUp={noop}
        onMoveDown={noop}
        onDelete={noop}
      />
    );
    await mount(panel("first"));
    await rerender(panel("second"));
    const row = document.querySelector('[data-emvb-layer="head0003"] .emvb-layer-select');
    await act(async () => (row as HTMLElement).click());
    expect(calls.at(-1)).toBe("second:head0003");
  });
});
