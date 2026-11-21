import { afterEach, describe, expect, test } from "bun:test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  EXTENSION_OUTPUTS_DEBOUNCE_MS,
  EXTENSION_OUTPUTS_RETRY_MS,
  extensionNodesIn,
  fetchExtensionOutputs,
  useExtensionOutputs,
} from "./extension-outputs.ts";

// W-1086: the admin asks the server for each extension element once.

const layout = {
  schemaVersion: 18,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "a0000001", type: "ext:kit/tile", props: { b: 1, a: 2 } },
      { id: "a0000002", type: "ext:kit/tile", props: { a: 2, b: 1 } },
      {
        id: "c0000001",
        type: "div-block",
        props: {},
        children: [{ id: "a0000003", type: "ext:kit/tile" }],
      },
      { id: "h0000001", type: "heading", props: { text: "x", level: 1 } },
    ],
  },
};

describe("extensionNodesIn (W-1086)", () => {
  test("finds each extension element once by type and props, in stored JSON text too", () => {
    expect(extensionNodesIn([layout, JSON.stringify(layout), "{broken"])).toEqual([
      { type: "ext:kit/tile", props: { b: 1, a: 2 } },
      { type: "ext:kit/tile" },
    ]);
  });

  test("fetchExtensionOutputs keeps array answers and drops a failed batch", async () => {
    const calls: unknown[] = [];
    const fetcher = (async (_path: string, init?: { body?: string }) => {
      calls.push(JSON.parse(init?.body ?? "{}"));
      return new Response(
        JSON.stringify({
          data: {
            outputs: [
              { key: "k1", nodes: [{ id: "x" }] },
              { key: "k2", nodes: null },
            ],
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    }) as never;
    const got = await fetchExtensionOutputs(fetcher, [{ type: "ext:kit/tile" }]);
    expect([...got.keys()]).toEqual(["k1"]);
    expect(calls).toHaveLength(1);
    const failing = (async () => new Response("no", { status: 500 })) as never;
    expect((await fetchExtensionOutputs(failing, [{ type: "ext:kit/tile" }])).size).toBe(0);
  });
});

describe("useExtensionOutputs (W-1086)", () => {
  let root: Root | undefined;
  afterEach(async () => {
    await act(async () => root?.unmount());
    root = undefined;
  });

  const tile = (text: string) => ({ id: "a0000001", type: "ext:kit/tile", props: { text } });
  const pageWith = (...children: unknown[]) => ({
    schemaVersion: 18,
    root: { id: "root0001", type: "container", props: {}, children },
  });
  const keyOf = (text: string) => `ext:kit/tile\n{"text":${JSON.stringify(text)}}`;

  /** Mounts the hook; returns a way to change the layout and the latest outputs. */
  async function mountHook(fetcher: unknown, first: unknown) {
    let latest: ReadonlyMap<string, unknown> = new Map();
    const Probe = (props: { layout: unknown }) => {
      latest = useExtensionOutputs(props.layout, fetcher as never);
      return null;
    };
    const host = document.createElement("div");
    root = createRoot(host);
    const created = root;
    await act(async () => created.render(createElement(Probe, { layout: first })));
    return {
      set: (next: unknown) =>
        act(async () => created.render(createElement(Probe, { layout: next }))),
      outputs: () => [...latest.keys()],
    };
  }
  const settle = () =>
    act(() => new Promise<void>((done) => setTimeout(done, EXTENSION_OUTPUTS_DEBOUNCE_MS + 80)));

  /** A fetcher that answers each asked element, or fails while `failing` is set. */
  function server() {
    const asked: string[][] = [];
    const state = { failing: false };
    const fetcher = async (_path: string, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? "{}") as { nodes: { type: string; props?: unknown }[] };
      asked.push(body.nodes.map((n) => JSON.stringify(n.props)));
      if (state.failing) return new Response("down", { status: 503 });
      const outputs = body.nodes.map((n) => ({
        key: `${n.type}\n${JSON.stringify(n.props)}`,
        nodes: [{ id: "h0000001", type: "heading", props: { text: "x", level: 2 } }],
      }));
      return new Response(JSON.stringify({ data: { outputs } }), {
        headers: { "content-type": "application/json" },
      });
    };
    return { fetcher, asked, state };
  }

  test("prop edits are asked for once they pause", async () => {
    const { fetcher, asked } = server();
    const hook = await mountHook(fetcher, pageWith(tile("a")));
    // oxlint-disable-next-line no-await-in-loop -- keystrokes, one after another
    for (const text of ["ab", "abc", "abcd"]) await hook.set(pageWith(tile(text)));
    await settle();
    expect(asked).toEqual([['{"text":"abcd"}']]);
    expect(hook.outputs()).toEqual([keyOf("abcd")]);
  });

  test("a failed request is asked again", async () => {
    const { fetcher, asked, state } = server();
    state.failing = true;
    const hook = await mountHook(fetcher, pageWith(tile("a")));
    await settle();
    expect(hook.outputs()).toEqual([]);
    state.failing = false;
    await act(() => new Promise<void>((done) => setTimeout(done, EXTENSION_OUTPUTS_RETRY_MS)));
    await settle();
    expect(asked).toEqual([['{"text":"a"}'], ['{"text":"a"}']]);
    expect(hook.outputs()).toEqual([keyOf("a")]);
  });

  test("outputs of elements no longer on the page are dropped", async () => {
    const { fetcher } = server();
    const hook = await mountHook(fetcher, pageWith(tile("a")));
    await settle();
    await hook.set(pageWith(tile("b")));
    await settle();
    expect(hook.outputs()).toEqual([keyOf("b")]);
  });
});
