import { beforeEach, describe, expect, test } from "bun:test";
import { clearExtensions, defineExtension } from "../../src/core/extensions/index.ts";
import { createPlugin, emvb } from "../../src/index.ts";

// W-1086: the editor canvas and the HTML export get extension output from this route.

const kit = defineExtension({
  id: "emvb-ext-kit",
  classes: { prefix: "kit-", allow: ["kit-card"] },
  elements: [
    {
      name: "promo-tile",
      label: "Promo",
      schema: { type: "object", properties: { text: { type: "string" } } },
      fields: [],
      render: (props) => ({
        id: "card0001",
        type: "heading",
        props: { text: String(props.text ?? ""), level: 2 },
        extClasses: ["kit-card", "kit-evil"],
      }),
    },
  ],
});

type Route = {
  permission?: string;
  input: { safeParse: (v: unknown) => { success: boolean } };
  handler: (ctx: never) => Promise<{ outputs: { key: string; nodes: unknown }[] }>;
};

beforeEach(() => clearExtensions());

describe("editor/extensions/render (W-1086)", () => {
  test("answers each element's checked output with its allowlisted classes", async () => {
    const options = emvb({ extensions: [kit] }).options;
    const route = createPlugin(options).routes["editor/extensions/render"] as Route;
    expect(route.permission).toBe("content:edit_any");
    const body = await route.handler({
      input: {
        nodes: [
          { type: "ext:emvb-ext-kit/promo-tile", props: { text: "Hi" } },
          { type: "ext:emvb-ext-gone/x", props: {} },
          { type: "heading", props: { text: "not an extension" } },
        ],
      },
    } as never);
    expect(body.outputs.map((o) => o.key)).toEqual([
      'ext:emvb-ext-kit/promo-tile\n{"text":"Hi"}',
      "ext:emvb-ext-gone/x\n{}",
      'heading\n{"text":"not an extension"}',
    ]);
    expect(body.outputs[0]?.nodes).toEqual([
      {
        id: "card0001",
        type: "heading",
        props: { text: "Hi", level: 2 },
        extClasses: ["kit-card"],
      },
    ]);
    expect(body.outputs[1]?.nodes).toBeNull();
    expect(body.outputs[2]?.nodes).toBeNull();
  });

  test("refuses oversized batches", () => {
    const route = createPlugin().routes["editor/extensions/render"] as Route;
    const nodes = Array.from({ length: 101 }, () => ({ type: "ext:a/b" }));
    expect(route.input.safeParse({ nodes }).success).toBe(false);
  });

  test("refuses props too deep or too large to key", () => {
    const route = createPlugin().routes["editor/extensions/render"] as Route;
    let deep: unknown = "leaf";
    for (let i = 0; i < 100_000; i += 1) deep = [deep];
    const node = (props: unknown) => ({ nodes: [{ type: "ext:a/b", props }] });
    expect(route.input.safeParse(node({ a: deep })).success).toBe(false);
    expect(route.input.safeParse(node({ a: "x".repeat(600 * 1024) })).success).toBe(false);
    let fine: unknown = "leaf";
    for (let i = 0; i < 8; i += 1) fine = { child: fine, list: [1, 2] };
    expect(route.input.safeParse(node({ a: fine, text: "Hi" })).success).toBe(true);
  });
});
