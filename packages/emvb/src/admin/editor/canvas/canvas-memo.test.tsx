import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { Layout, VNode } from "../../../core/index.ts";
import { CanvasFrame, type CanvasSelection } from "./CanvasFrame.tsx";
import { cleanup, mount, rerender } from "../../../../test/dom/mount.ts";

afterEach(cleanup);

const layout: Layout = {
  schemaVersion: 14,
  root: { id: "root0001", type: "container", props: {}, children: [] },
};

/** A page vnode whose `attrs` reads are counted: each conversion to React reads every node's. */
function countedVnode(count: number): { vnode: VNode; reads: () => number } {
  let reads = 0;
  const node = (tag: string, children: (VNode | string)[]): VNode => {
    const attrs = { class: tag };
    return {
      tag,
      children,
      get attrs() {
        reads += 1;
        return attrs;
      },
    } as VNode;
  };
  const vnode = node(
    "div",
    Array.from({ length: count }, (_, i) => node("p", [`Item ${i}`])),
  );
  return { vnode, reads: () => reads };
}

const selection = (selectedId: string | null): CanvasSelection => ({
  selectedId,
  labelFor: () => "Element",
  canDelete: () => true,
  canMove: () => true,
  canDuplicate: () => true,
  onSelect: () => {},
  onDelete: () => {},
  onDuplicate: () => {},
  onKeyDown: () => {},
});

const frame = (vnode: VNode, selectedId: string | null) => (
  <CanvasFrame
    vnode={vnode}
    css=""
    layout={layout}
    selection={selection(selectedId)}
    onDropNew={() => {}}
    onMove={() => {}}
    onCommitText={() => {}}
  />
);

describe("W-268 the canvas page tree is built once per layout render", () => {
  test("a selection change re-renders the frame without rebuilding the page", async () => {
    const { vnode, reads } = countedVnode(50);
    await mount(frame(vnode, null));
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    await act(async () => {
      iframe.dispatchEvent(new Event("load"));
    });
    expect(iframe.contentDocument?.body.querySelectorAll("p").length).toBe(50);
    const built = reads();
    expect(built).toBeGreaterThanOrEqual(51);
    await rerender(frame(vnode, "root0001"));
    await rerender(frame(vnode, null));
    expect(reads()).toBe(built);
  });

  test("a new page vnode is rendered", async () => {
    const first = countedVnode(3);
    await mount(frame(first.vnode, null));
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    await act(async () => {
      iframe.dispatchEvent(new Event("load"));
    });
    const next = countedVnode(5);
    await rerender(frame(next.vnode, null));
    expect(iframe.contentDocument?.body.querySelectorAll("p").length).toBe(5);
  });
});
