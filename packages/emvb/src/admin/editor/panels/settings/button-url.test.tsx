import { afterEach, describe, expect, test } from "bun:test";
import { emptyDesign, type Layout, type LayoutNode } from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { ElementPanel } from "../ElementPanel.tsx";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { buttonUrlNote } from "./button-url.ts";

const stubFetcher: Fetcher = async () => new Response("{}", { status: 200 });
afterEach(async () => {
  await cleanup();
  sessionStorage.clear();
});

const button = (props: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ id: "btn00001", type: "button", props: { text: "Go", ...props }, ...extra }) as LayoutNode;

describe("Button without a URL (W-273)", () => {
  test("no URL, a blank one or a refused one gets a note", () => {
    expect(buttonUrlNote(button({}))).toContain("No URL");
    expect(buttonUrlNote(button({ href: "  " }))).toContain("No URL");
    expect(buttonUrlNote(button({ href: "javascript:alert(1)" }))).toContain("isn't allowed");
  });

  test("a URL, an HTML id or a class (a popup or script target) means no note", () => {
    expect(buttonUrlNote(button({ href: "/contact" }))).toBeUndefined();
    expect(buttonUrlNote(button({ href: "https://example.com" }))).toBeUndefined();
    expect(buttonUrlNote(button({}, { htmlId: "open-offer" }))).toBeUndefined();
    expect(buttonUrlNote(button({}, { classes: ["cls00001"] }))).toBeUndefined();
    const heading = { id: "head0001", type: "heading", props: { text: "Hi", level: 2 } };
    expect(buttonUrlNote(heading as LayoutNode)).toBeUndefined();
  });

  test("the Button panel shows the note", async () => {
    const node = button({});
    const layout = {
      schemaVersion: 14,
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
    expect(document.querySelector("[data-emvb-button-url]")?.textContent).toContain("No URL");
  });
});

describe("Link without a URL (W-276)", () => {
  const link = (href: string) =>
    ({ id: "link0001", type: "link", props: { text: "Docs", href } }) as LayoutNode;
  test("an empty or refused URL gets a note; a real one doesn't", () => {
    expect(buttonUrlNote(link(""))).toContain("No URL");
    expect(buttonUrlNote(link("javascript:alert(1)"))).toContain("isn't allowed");
    expect(buttonUrlNote(link("/docs"))).toBeUndefined();
  });
});
