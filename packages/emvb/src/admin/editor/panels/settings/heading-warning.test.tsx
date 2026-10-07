import { afterEach, describe, expect, test } from "bun:test";
import { emptyDesign, type Layout, type LayoutNode } from "../../../../core/index.ts";
import type { ThemePartType } from "../../../../core/theme/part-types.ts";
import type { Fetcher } from "../../../api.ts";
import { ElementPanel } from "../ElementPanel.tsx";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { sharedPartH1 } from "./heading-warning.ts";

const stubFetcher: Fetcher = async () => new Response("{}", { status: 200 });
afterEach(async () => {
  await cleanup();
  sessionStorage.clear();
});

const h = (level: number): LayoutNode => ({
  id: "head0001",
  type: "heading",
  props: { text: "Hi", level },
});
const title = (level?: number): LayoutNode =>
  ({ id: "titl0001", type: "post-title", props: level ? { level } : {} }) as LayoutNode;

describe("H1 in a shared theme part (W-208)", () => {
  test("flags an H1 in headers, footers, popups, floats, sections and loop items only", () => {
    for (const part of ["header", "footer", "popup", "float", "section", "loop_item"] as const) {
      expect(sharedPartH1(h(1), part)).toBe(true);
    }
    expect(sharedPartH1(h(2), "header")).toBe(false);
    expect(sharedPartH1(h(1), undefined)).toBe(false);
    for (const part of ["single_post", "archive", "error_404", "page_template"] as const) {
      expect(sharedPartH1(h(1), part)).toBe(false);
    }
    expect(sharedPartH1(title(), "loop_item")).toBe(true);
    expect(sharedPartH1(title(3), "loop_item")).toBe(false);
  });

  test("the Heading panel shows the note in a header, not on a page", async () => {
    const node = h(1);
    const layout: Layout = {
      schemaVersion: 12,
      root: { id: "root0001", type: "container", props: {}, children: [node] },
    };
    const render = (partType?: ThemePartType) =>
      mount(
        <ElementPanel
          node={node}
          layout={layout}
          design={emptyDesign()}
          rejection={null}
          fetcher={stubFetcher}
          onChange={() => undefined}
          onDesignChange={async () => undefined}
          onSelect={() => undefined}
          partType={partType}
        />,
      );
    await render("header");
    expect(document.querySelector("[data-emvb-shared-h1]")?.textContent).toContain("two");
    await cleanup();
    await render(undefined);
    expect(document.querySelector("[data-emvb-shared-h1]")).toBeNull();
  });
});
