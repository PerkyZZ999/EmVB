import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { Layout, VNode } from "../../../core/index.ts";
import type { Fetcher } from "../../api.ts";
import { CanvasFrame, type CanvasSelection } from "./CanvasFrame.tsx";
import { EditorHostContext, useCanvasStyles, type EditorHost } from "../host.ts";
import { cleanup, mount, rerender } from "../../../../test/dom/mount.ts";

afterEach(cleanup);

const layout: Layout = {
  schemaVersion: 14,
  root: { id: "root0001", type: "container", props: {}, children: [] },
};
const vnode: VNode = { tag: "div", attrs: {}, children: ["Page"] };
const selection: CanvasSelection = {
  selectedId: null,
  labelFor: () => "Element",
  canDelete: () => true,
  canMove: () => true,
  canDuplicate: () => true,
  onSelect: () => {},
  onDelete: () => {},
  onDuplicate: () => {},
  onKeyDown: () => {},
};
const frame = (canvasStyles: readonly string[]) => (
  <CanvasFrame
    vnode={vnode}
    css=".emvb-x{color:red}"
    canvasStyles={canvasStyles}
    layout={layout}
    selection={selection}
    onDropNew={() => {}}
    onMove={() => {}}
    onCommitText={() => {}}
  />
);

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const head = () => {
  const iframe = document.querySelector("iframe") as HTMLIFrameElement;
  return iframe.contentDocument?.head as HTMLHeadElement;
};

describe("the canvas loads the host's stylesheets first (W-327)", () => {
  test("links go before EmVB's CSS, also when they arrive after it", async () => {
    await mount(frame([]));
    await act(async () => {
      (document.querySelector("iframe") as HTMLIFrameElement).dispatchEvent(new Event("load"));
    });
    expect(head().querySelectorAll("link[data-emvb-canvas-style]")).toHaveLength(0);
    await rerender(frame(["/site.css", "https://fonts.example.com/a.css"]));
    const order = [...head().children].map((el) =>
      el.tagName === "LINK" ? (el as HTMLLinkElement).getAttribute("href") : el.tagName,
    );
    const emvb = [...head().children].findIndex((el) => el.hasAttribute("data-emvb-canvas-css"));
    expect(order.indexOf("/site.css")).toBeLessThan(emvb);
    expect(order.indexOf("https://fonts.example.com/a.css")).toBeLessThan(emvb);
    expect(order.indexOf("/site.css")).toBeLessThan(
      order.indexOf("https://fonts.example.com/a.css"),
    );
    await rerender(frame([]));
    expect(head().querySelectorAll("link[data-emvb-canvas-style]")).toHaveLength(0);
  });
});

describe("useCanvasStyles (W-327)", () => {
  const probe = (fetcher: Fetcher, host?: Partial<EditorHost>) => {
    let seen: readonly string[] = [];
    function Probe() {
      seen = useCanvasStyles(fetcher);
      return null;
    }
    const tree = host ? (
      <EditorHostContext.Provider
        value={{ exit: () => {}, back: { label: "", go: () => {} }, ...host }}
      >
        <Probe />
      </EditorHostContext.Provider>
    ) : (
      <Probe />
    );
    return { tree, seen: () => seen };
  };

  test("asks the plugin's editor/config route and keeps only safe URLs", async () => {
    const asked: string[] = [];
    const fetcher: Fetcher = async (path) => {
      asked.push(String(path));
      return Response.json({ data: { canvasStyles: ["/site.css", "javascript:x"] } });
    };
    const { tree, seen } = probe(fetcher);
    await mount(tree);
    await flush();
    expect(asked).toEqual(["/_emdash/api/plugins/emvb/editor/config"]);
    expect(seen()).toEqual(["/site.css"]);
  });

  test("a host that provides stylesheets isn't asked", async () => {
    let asked = 0;
    const fetcher: Fetcher = async () => {
      asked += 1;
      return new Response("{}", { status: 500 });
    };
    const provided = probe(fetcher, { canvasStyles: ["/playground.css"] });
    await mount(provided.tree);
    await flush();
    expect(provided.seen()).toEqual(["/playground.css"]);
    expect(asked).toBe(0);
  });

  test("a failing route gives no stylesheets", async () => {
    const fetcher: Fetcher = async () => new Response("{}", { status: 500 });
    const failing = probe(fetcher);
    await mount(failing.tree);
    await flush();
    expect(failing.seen()).toEqual([]);
  });
});
