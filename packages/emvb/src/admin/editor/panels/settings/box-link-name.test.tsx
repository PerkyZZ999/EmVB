import { afterEach, describe, expect, test } from "bun:test";
import { emptyDesign, type Layout, type LayoutNode } from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { ElementPanel } from "../ElementPanel.tsx";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { unnamedBoxLink } from "./box-link-name.ts";

const stubFetcher: Fetcher = async () => new Response("{}", { status: 200 });
afterEach(async () => {
  await cleanup();
  sessionStorage.clear();
});

const box = (props: Record<string, unknown>, children: unknown[] = [], extra = {}): LayoutNode =>
  ({ id: "box00001", type: "div-block", props, children, ...extra }) as unknown as LayoutNode;
const img = (alt: string) => ({ id: "img00001", type: "image", props: { src: "/a.png", alt } });

describe("a linked box with nothing that names it (W-261)", () => {
  test("flags an empty linked box and one holding only an image without alt", () => {
    expect(unnamedBoxLink(box({ href: "/x" }))).toBe(true);
    expect(unnamedBoxLink(box({ href: "/x" }, [img("")]))).toBe(true);
    expect(
      unnamedBoxLink(
        box({ href: "/x" }, [{ id: "box00002", type: "container", props: {}, children: [] }]),
      ),
    ).toBe(true);
  });

  test("text, image alt, an aria-label, or dynamic content inside name it", () => {
    expect(unnamedBoxLink(box({ href: "/x" }, [img("Team photo")]))).toBe(false);
    expect(
      unnamedBoxLink(
        box({ href: "/x" }, [{ id: "head0001", type: "heading", props: { text: "Hi", level: 2 } }]),
      ),
    ).toBe(false);
    expect(
      unnamedBoxLink(
        box({ href: "/x" }, [], { attributes: [{ name: "aria-label", value: "Go" }] }),
      ),
    ).toBe(false);
    expect(
      unnamedBoxLink(box({ href: "/x" }, [{ id: "titl0001", type: "post-title", props: {} }])),
    ).toBe(false);
  });

  test("no link, a blank link or a refused link is not flagged", () => {
    expect(unnamedBoxLink(box({}))).toBe(false);
    expect(unnamedBoxLink(box({ href: "  " }))).toBe(false);
    expect(unnamedBoxLink(box({ href: "javascript:alert(1)" }))).toBe(false);
  });

  test("the box's settings show the note", async () => {
    const node = box({ href: "/x" });
    const layout: Layout = {
      schemaVersion: 13,
      root: { id: "root0001", type: "container", props: {}, children: [node] },
    } as Layout;
    await mount(
      <ElementPanel
        node={node}
        layout={layout}
        design={emptyDesign()}
        rejection={null}
        fetcher={stubFetcher}
        onChange={() => undefined}
        onDesignChange={async () => undefined}
        onSelect={() => undefined}
      />,
    );
    const tab = [...document.querySelectorAll('[role="tab"]')].find((el) =>
      /content/i.test(el.textContent ?? ""),
    ) as HTMLElement | undefined;
    if (tab) tab.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector("[data-emvb-unnamed-link]")?.textContent).toContain("aria-label");
  });
});
