import { beforeEach, describe, expect, test } from "bun:test";
import {
  clearExtensions,
  defineExtension,
  rememberExtensionManifests,
} from "../../src/core/extensions/index.ts";
import { renderPage } from "../../src/core/render/index.ts";
import { emptyDesign } from "../../src/core/schema/design.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout } from "../../src/core/schema/layout.ts";
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

// W-1088 (#35): the canvas showed "Missing extension" for a site's extension. The admin has no
// extension code; it renders what this route answers. An extension without `module` is live only
// where astro.config ran (a Node dev server), and must reach the canvas there too.
describe("the editor canvas shows a site extension's output (W-1088, #35)", () => {
  const plain = defineExtension({
    id: "emvb-ext-plain",
    label: "Plain",
    elements: [
      {
        name: "notice",
        label: "Notice",
        schema: { type: "object", properties: { text: { type: "string" } } },
        fields: [{ key: "text", kind: "text", label: "Text" }],
        render: (props) => ({
          id: "note0001",
          type: "heading",
          props: { text: `Notice: ${String(props.text ?? "")}`, level: 2 },
        }),
      },
    ],
  });

  test("an extension without module renders on the canvas, not as a placeholder", async () => {
    const plugin = createPlugin(emvb({ extensions: [plain] }).options);
    const routes = plugin.routes as unknown as Record<string, Route>;
    const config = JSON.parse(
      JSON.stringify(await routes["editor/config"]?.handler({} as never)),
    ) as { extensions: unknown[] };
    const node = { id: "note0001", type: "ext:emvb-ext-plain/notice", props: { text: "Hi" } };
    const answer = JSON.parse(
      JSON.stringify(
        await routes["editor/extensions/render"]?.handler({
          input: { nodes: [{ type: node.type, props: node.props }] },
        } as never),
      ),
    ) as { outputs: { key: string; nodes: unknown }[] };

    // The admin: the manifests from editor/config and the route's answers, no live code.
    clearExtensions();
    rememberExtensionManifests(config.extensions);
    const layout: Layout = {
      schemaVersion: LAYOUT_SCHEMA_VERSION,
      root: { id: "root0001", type: "container", props: {}, children: [node] },
    } as Layout;
    const outputs = new Map(answer.outputs.map((o) => [o.key, o.nodes]));
    const { html } = renderPage(layout, emptyDesign(), {
      mode: "editor",
      extensionOutputs: outputs,
    });
    expect(html).toContain("Notice: Hi");
    expect(html).toContain('data-emvb-ext="ext:emvb-ext-plain/notice"');
    expect(html).not.toContain("emvb-ext-missing");
  });
});

// W-1088 (#36): an extension panel lists its source's values read-only. The admin has no extension
// code, so the server resolves the sources the panels name.
describe("editor/extensions/sources (W-1088, #36)", () => {
  type SourcesRoute = {
    permission?: string;
    handler: (ctx: never) => Promise<{
      sources: { id: string; values: Record<string, string> | null }[];
    }>;
  };
  const office = (resolve: () => unknown, more: Record<string, unknown> = {}) =>
    defineExtension({
      id: "emvb-ext-office",
      label: "Office",
      panels: [
        { name: "about", label: "About", source: "office" },
        { name: "nothing", label: "No source" },
        { name: "ghost", label: "Ghost", source: "not-declared" },
      ],
      sources: [
        { name: "office", label: "Office", capabilities: ["text"], resolve: resolve as never },
        { name: "unused", label: "Unused", capabilities: ["text"], resolve: () => ({ a: "b" }) },
      ],
      ...more,
    });
  const sourcesOf = async (ext: ReturnType<typeof defineExtension>) => {
    const route = createPlugin(emvb({ extensions: [ext] }).options).routes[
      "editor/extensions/sources"
    ] as unknown as SourcesRoute;
    expect(route.permission).toBe("content:edit_any");
    return (await route.handler({} as never)).sources;
  };

  test("resolves each source a panel names, cleaned like bound values", async () => {
    const sources = await sourcesOf(
      office(async () => ({
        city: "  Montréal\u0007 ",
        phone: "\u202Eexe.jpg",
        "bad key": "dropped",
        count: 3,
        html: "<b>kept as text</b>",
      })),
    );
    expect(sources).toEqual([
      {
        id: "ext:emvb-ext-office/office",
        values: { city: "Montréal", phone: "exe.jpg", html: "<b>kept as text</b>" },
      },
    ]);
  });

  test("a throwing, hanging or missing source answers null, never fails the route", async () => {
    expect(
      await sourcesOf(
        office(() => {
          throw new Error("boom");
        }),
      ),
    ).toEqual([{ id: "ext:emvb-ext-office/office", values: null }]);
    expect(await sourcesOf(office(() => "not a record"))).toEqual([
      { id: "ext:emvb-ext-office/office", values: null },
    ]);
    // The manifest without the live code: an extension without module on a Worker.
    const options = emvb({ extensions: [office(() => ({ city: "x" }))] }).options;
    clearExtensions();
    const route = createPlugin(options).routes[
      "editor/extensions/sources"
    ] as unknown as SourcesRoute;
    expect((await route.handler({} as never)).sources).toEqual([
      { id: "ext:emvb-ext-office/office", values: null },
    ]);
  });
});
