import { afterEach, describe, expect, test } from "bun:test";
import { emptyDesign, type Layout, type LayoutNode } from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { ElementPanel } from "../ElementPanel.tsx";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { loopContextNote } from "./loop-context.ts";

const stubFetcher: Fetcher = async () => new Response("{}", { status: 200 });
afterEach(async () => {
  await cleanup();
  sessionStorage.clear();
});

const loop = { id: "loop0001", type: "loop", props: {}, children: [] } as unknown as LayoutNode;
const pagination = { id: "pagi0001", type: "pagination", props: {} } as unknown as LayoutNode;

describe("Loop and Pagination outside an archive (W-271)", () => {
  test("on a page, or in a header or single template, they say the live page shows nothing", () => {
    expect(loopContextNote(loop, undefined)).toContain("only in an Archive template");
    expect(loopContextNote(pagination, undefined)).toContain("only in an Archive template");
    expect(loopContextNote(loop, "header")).toBeDefined();
    expect(loopContextNote(loop, "single_post")).toBeDefined();
    expect(loopContextNote(loop, "search_results")).toBeDefined();
  });

  test("in an archive template or a synced section they don't, and other elements never do", () => {
    expect(loopContextNote(loop, "archive")).toBeUndefined();
    expect(loopContextNote(pagination, "archive")).toBeUndefined();
    expect(loopContextNote(loop, "section")).toBeUndefined();
    const heading = { id: "head0001", type: "heading", props: { text: "Hi", level: 2 } };
    expect(loopContextNote(heading as LayoutNode, undefined)).toBeUndefined();
  });

  test("the Loop panel on a page shows the note", async () => {
    const layout = {
      schemaVersion: 14,
      root: { id: "root0001", type: "container", props: {}, children: [loop] },
    } as Layout;
    await mount(
      <ElementPanel
        node={loop}
        layout={layout}
        design={emptyDesign()}
        rejection={null}
        fetcher={stubFetcher}
        onChange={() => undefined}
        onDesignChange={async () => undefined}
        onSelect={() => undefined}
      />,
    );
    expect(document.querySelector("[data-emvb-loop-note]")?.textContent).toContain(
      "the live page shows nothing",
    );
  });
});
