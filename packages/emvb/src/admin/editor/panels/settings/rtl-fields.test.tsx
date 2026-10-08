import { afterEach, describe, expect, test } from "bun:test";
import { emptyDesign, type Layout, type LayoutNode } from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { ElementPanel } from "../ElementPanel.tsx";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";

const stubFetcher: Fetcher = async () => new Response("{}", { status: 200 });
afterEach(async () => {
  await cleanup();
  sessionStorage.clear();
});

async function panel(node: LayoutNode) {
  const layout = {
    schemaVersion: 12,
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
}

describe("W-272 settings text fields follow their text's direction", () => {
  test("a Heading's Text field is dir=auto", async () => {
    await panel({ id: "head0001", type: "heading", props: { text: "مرحبا", level: 2 } });
    const input = document.querySelector('input[data-emvb-field="text"]');
    expect(input?.getAttribute("dir")).toBe("auto");
  });

  test("a Text element's textarea is dir=auto", async () => {
    await panel({ id: "text0001", type: "text", props: { text: "שלום" } });
    expect(document.querySelector("textarea.emvb-textarea")?.getAttribute("dir")).toBe("auto");
  });

  test("a URL field stays left-to-right", async () => {
    await panel({ id: "link0001", type: "link", props: { text: "רשימה", href: "/a" } });
    expect(document.querySelector('input[data-emvb-field="href"]')?.getAttribute("dir")).toBeNull();
  });
});
