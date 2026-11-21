import { describe, expect, test } from "bun:test";
import { extensionNodesIn, fetchExtensionOutputs } from "./extension-outputs.ts";

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
