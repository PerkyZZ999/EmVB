import { beforeEach, describe, expect, test } from "bun:test";
import { buildSiteExport } from "../export/site.ts";
import { renderPage } from "../render/index.ts";
import { emptyDesign } from "../schema/design.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout } from "../schema/layout.ts";
import {
  cleanExtensionAssets,
  classPrefixIssue,
  extensionCssIssue,
  extensionRuntimeIssue,
  filterExtensionClasses,
  MAX_CLASSES_PER_NODE,
  normalizeClasses,
} from "./classes.ts";
import { defineExtension } from "./define.ts";
import { normalizeExtension } from "./normalize.ts";
import {
  clearExtensions,
  extensionAssets,
  extensionClassAllowlist,
  extensionStylesheets,
  listedExtensionManifests,
  manifestsFromOptions,
  registerBundledExtensions,
  rememberExtensionAssets,
  rememberExtensionManifests,
  rememberExtensions,
} from "./registry.ts";
import { extensionOutputKey, liveExtensionOutput } from "./render-ext.ts";
import { extensionClassesOf, safeExtensionOutput, withExtensionClasses } from "./safe-nodes.ts";
import type { ExtensionOutputNode } from "./types.ts";

// W-1086: class allowlists, build-time css and runtime, and where they are emitted.

const TYPE = "ext:emvb-ext-kit/promo-tile";
const CSS = ".kit-btn{border:2px solid red}";
const RUNTIME = '(() => { document.body.dataset.kit = "1"; })();';

const kit = (out: (props: Record<string, unknown>) => unknown = () => null) =>
  defineExtension({
    id: "emvb-ext-kit",
    classes: { prefix: "kit-", allow: ["kit-btn", "kit-btn-primary", "kit-card"] },
    elements: [
      {
        name: "promo-tile",
        label: "Button",
        schema: { type: "object", properties: { text: { type: "string", default: "Go" } } },
        fields: [],
        render: (props) =>
          (out(props) ?? {
            id: "btn00001",
            type: "heading",
            props: { text: String(props.text ?? "Go"), level: 2 },
            extClasses: ["kit-btn", "kit-btn-primary"],
          }) as ExtensionOutputNode,
      },
    ],
  });

const page = (...children: Layout["root"]["children"]): Layout => ({
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: { id: "root0001", type: "container", props: {}, children },
});
const button = { id: "ext00001", type: TYPE, props: { text: "Buy" } };
const heading = { id: "head0001", type: "heading", props: { text: "Plain", level: 1 } };

beforeEach(() => clearExtensions());

describe("class allowlist at registration (W-1086)", () => {
  test("a prefixed allowlist is kept", () => {
    expect(normalizeClasses({ prefix: "d-", allow: ["d-btn", "d-btn-primary"] })).toEqual({
      prefix: "d-",
      allow: ["d-btn", "d-btn-primary"],
    });
  });

  test("prefixes that could clash or break the pattern are refused", () => {
    for (const prefix of [
      "emvb-",
      "emvbx-",
      "Emvb-",
      "D-",
      "d",
      "-d-",
      "d_",
      "d--",
      "1d-",
      "d -",
      "",
      "a-very-long-prefix-",
      42,
    ]) {
      expect(classPrefixIssue(prefix)).toBeDefined();
      expect(normalizeClasses({ prefix, allow: ["d-btn"] })).toBeUndefined();
    }
    expect(classPrefixIssue("acme-ui-")).toBeUndefined();
  });

  test("names with spaces, quotes, markup, other prefixes or emvb are dropped one by one", () => {
    const allow = [
      "d-btn",
      "d-btn d-evil",
      'd-x"onmouseover="y',
      "d-<script>",
      "d-UPPER",
      "x-other",
      "emvb-root",
      "d-",
      `d-${"a".repeat(80)}`,
      "d-ok",
      7,
    ];
    expect(normalizeClasses({ prefix: "d-", allow })?.allow).toEqual(["d-btn", "d-ok"]);
    expect(normalizeClasses({ prefix: "d-", allow: ["x-y"] })).toBeUndefined();
    expect(normalizeClasses({ prefix: "d-", allow: "d-btn" })).toBeUndefined();
  });

  test("the extension's manifest carries the checked allowlist; a bad one is left out", () => {
    const ok = normalizeExtension(kit());
    expect(ok?.manifest.classes?.allow).toEqual(["kit-btn", "kit-btn-primary", "kit-card"]);
    const bad = normalizeExtension({ ...kit(), classes: { prefix: "emvb-", allow: ["emvb-x"] } });
    expect(bad?.manifest.classes).toBeUndefined();
    // The extension itself still registers (a bad allowlist never takes the plugin down).
    expect(bad?.manifest.elements).toHaveLength(1);
  });
});

describe("classes on extension output (W-1086)", () => {
  const allow = new Set(["kit-btn", "kit-btn-primary", "kit-card"]);

  test("only allowlisted names are kept, deduplicated and capped", () => {
    expect(
      filterExtensionClasses(
        [
          "kit-btn",
          "kit-btn",
          "kit-btn kit-card",
          '"kit-card"',
          "<kit-card>",
          "emvb-root",
          "kit-unlisted",
          { toString: () => "kit-card" },
          "kit-card",
        ],
        allow,
      ),
    ).toEqual(["kit-btn", "kit-card"]);
    expect(filterExtensionClasses("kit-btn", allow)).toEqual([]);
    expect(filterExtensionClasses(["kit-btn"], undefined)).toEqual([]);
    const many = new Set(Array.from({ length: 40 }, (_, i) => `kit-c${i}`));
    expect(filterExtensionClasses([...many], many)).toHaveLength(MAX_CLASSES_PER_NODE);
  });

  test("safe output keeps classes beside nested nodes, never in the layout data", () => {
    const nodes = safeExtensionOutput(
      {
        id: "card0001",
        type: "div-block",
        props: {},
        extClasses: ["kit-card", "kit-nope"],
        children: [
          {
            id: "head0001",
            type: "heading",
            props: { text: "x", level: 2 },
            extClasses: ["kit-btn"],
          },
        ],
      },
      Math.random,
      allow,
    );
    const [card] = nodes;
    expect(card ? extensionClassesOf(card) : undefined).toEqual(["kit-card"]);
    const child = (card as { children?: object[] } | undefined)?.children?.[0];
    expect(child ? extensionClassesOf(child) : undefined).toEqual(["kit-btn"]);
    expect(JSON.stringify(nodes)).not.toContain("kit-");
    // The editor route sends them back as plain JSON.
    expect(JSON.stringify(withExtensionClasses(nodes))).toContain('"extClasses":["kit-card"]');
  });

  test("rendered as extra class names on the built-in element, unlisted names dropped", () => {
    rememberExtensions([
      kit(() => ({
        id: "btn00001",
        type: "heading",
        props: { text: "Buy", level: 2 },
        extClasses: ["kit-btn", 'kit-btn" onclick="x', "emvb-root", "kit-btn-primary", "x y"],
      })),
    ]);
    const { html } = renderPage(page(button), emptyDesign());
    expect(html).toContain('class="emvb-heading kit-btn kit-btn-primary"');
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("x y");
  });

  test("an extension without an allowlist gets no classes", () => {
    rememberExtensions([{ ...kit(), classes: undefined }]);
    const { html } = renderPage(page(button), emptyDesign());
    expect(html).toContain('class="emvb-heading"');
    expect(html).not.toContain("kit-btn");
  });
});

describe("css and runtime text (W-1086)", () => {
  test("text that could leave its element, or a module, is refused", () => {
    expect(extensionCssIssue(".a{}</style><script>x()</script>")).toBeDefined();
    expect(extensionCssIssue(".a{}</STYLE >")).toBeDefined();
    expect(extensionCssIssue("x".repeat(300 * 1024))).toBeDefined();
    expect(extensionCssIssue(CSS)).toBeUndefined();
    expect(extensionRuntimeIssue("x()</script><script>y()")).toBeDefined();
    expect(extensionRuntimeIssue("a = '<!--';")).toBeDefined();
    expect(extensionRuntimeIssue('import x from "y";\nx();')).toBeDefined();
    expect(extensionRuntimeIssue("export const a = 1;")).toBeDefined();
    expect(extensionRuntimeIssue('  import("https://cdn.example/x.js");')).toBeDefined();
    expect(extensionRuntimeIssue("const importantThing = 1;\nexports.a = 1;")).toBeUndefined();
    expect(extensionRuntimeIssue("x".repeat(70 * 1024))).toBeDefined();
    expect(cleanExtensionAssets({ css: CSS, runtime: "x()</script>" })).toEqual({ css: CSS });
    expect(cleanExtensionAssets({ css: 1, runtime: "" })).toBeUndefined();
  });

  test("serialized options hand the build-time text to a server without files", () => {
    manifestsFromOptions([
      {
        extensionApi: 1,
        id: "emvb-ext-kit",
        elements: [],
        panels: [],
        sources: [],
        assets: { css: CSS, runtime: RUNTIME },
      },
    ]);
    expect(extensionAssets("emvb-ext-kit")).toEqual({ css: CSS, runtime: RUNTIME });
    manifestsFromOptions([{ extensionApi: 1, id: "emvb-ext-bad", assets: { css: "</style>" } }]);
    expect(extensionAssets("emvb-ext-bad")).toBeUndefined();
  });

  test("the stylesheet and runtime come only with a page that renders the element", () => {
    rememberExtensions([kit()]);
    rememberExtensionAssets("emvb-ext-kit", { css: CSS, runtime: RUNTIME });
    const plainWithout = renderPage(page(heading), emptyDesign(), { scope: "page0001" });
    const used = renderPage(page(heading, button), emptyDesign(), { scope: "page0001" });
    expect(used.css).toContain(`/* emvb-ext-kit */\n${CSS}`);
    expect(used.css.match(/emvb-ext-kit \*\//g)).toHaveLength(1);
    expect(used.runtimes).toContain("ext:emvb-ext-kit");
    expect(plainWithout.css).not.toContain(CSS);
    expect(plainWithout.runtimes).toEqual([]);
    // Two elements of the extension still write its stylesheet once.
    const twice = renderPage(page(button, { ...button, id: "ext00002" }), emptyDesign());
    expect(twice.css.match(/emvb-ext-kit \*\//g)).toHaveLength(1);
  });

  test("a page whose extension element can't render gets neither", () => {
    rememberExtensionAssets("emvb-ext-kit", { css: CSS, runtime: RUNTIME });
    const missing = renderPage(page(button), emptyDesign());
    expect(missing.css).not.toContain(CSS);
    expect(missing.runtimes).toEqual([]);
  });

  test("a runtime-less extension adds no runtime name", () => {
    rememberExtensions([kit()]);
    rememberExtensionAssets("emvb-ext-kit", { css: CSS });
    expect(renderPage(page(button), emptyDesign()).runtimes).toEqual([]);
  });
});

describe("the admin renders the server's output (W-1086)", () => {
  test("manifests and server outputs give the canvas the classes and stylesheet", () => {
    rememberExtensions([kit()]);
    const server = liveExtensionOutput(button);
    const json = JSON.parse(JSON.stringify(withExtensionClasses(server ?? []))) as unknown;
    const manifest = JSON.parse(
      JSON.stringify(
        listedExtensionManifests().map((m) =>
          Object.assign({}, m, { assets: { css: CSS, runtime: RUNTIME } }),
        ),
      ),
    ) as unknown[];
    clearExtensions();

    rememberExtensionManifests(manifest);
    expect(extensionClassAllowlist("emvb-ext-kit")?.has("kit-btn")).toBe(true);
    const outputs = new Map([[extensionOutputKey(button), json]]);
    const result = renderPage(page(button), emptyDesign(), {
      mode: "editor",
      extensionOutputs: outputs,
    });
    expect(result.html).toContain("kit-btn kit-btn-primary");
    expect(result.css).toContain(CSS);
    // Without the server's answer the canvas shows the placeholder.
    expect(renderPage(page(button), emptyDesign(), { mode: "editor" }).html).toContain(
      "emvb-ext-missing",
    );
  });

  test("an output forged past the allowlist loses its unlisted classes on the admin too", () => {
    rememberExtensionManifests([
      {
        extensionApi: 1,
        id: "emvb-ext-kit",
        elements: [],
        panels: [],
        sources: [],
        classes: { prefix: "kit-", allow: ["kit-btn"] },
      },
    ]);
    const forged = [
      {
        id: "btn00001",
        type: "heading",
        props: { text: "x", level: 2 },
        extClasses: ["kit-btn", "kit-evil", "a b"],
      },
    ];
    const outputs = new Map([[extensionOutputKey(button), forged]]);
    const { html } = renderPage(page(button), emptyDesign(), { extensionOutputs: outputs });
    expect(html).toContain('class="emvb-heading kit-btn"');
  });
});

describe("bundled registration (W-1086)", () => {
  test("the generated entry registers the module export with the matching id", () => {
    registerBundledExtensions([
      [{ default: kit(), other: { extensionApi: 1, id: "someone-else" } }, "emvb-ext-kit"],
      [null, "emvb-ext-none"],
      [{ default: kit() }, "emvb-ext-wrong-id"],
    ]);
    expect(listedExtensionManifests().map((m) => m.id)).toEqual(["emvb-ext-kit"]);
  });

  test("a Worker keeps the manifest of an extension without module next to a bundled one", () => {
    // astro.config ran in another process: these are the serialized options EmDash passes.
    const serialized = JSON.parse(
      JSON.stringify([
        {
          extensionApi: 1,
          id: "emvb-ext-plain",
          elements: [{ type: "ext:emvb-ext-plain/note", name: "note", label: "Note" }],
          panels: [],
          sources: [],
          classes: { prefix: "plain-", allow: ["plain-note"] },
          assets: { css: ".plain-note{}" },
        },
        { ...normalizeExtension(kit())?.manifest, assets: { css: CSS } },
      ]),
    ) as unknown[];
    // The generated server entry registered only the extension that names its module.
    registerBundledExtensions([[{ default: kit() }, "emvb-ext-kit"]]);
    const manifests = manifestsFromOptions(serialized);
    expect(manifests.map((m) => m.id)).toEqual(["emvb-ext-plain", "emvb-ext-kit"]);
    expect(manifests[0]?.elements.map((e) => e.type)).toEqual(["ext:emvb-ext-plain/note"]);
    expect(manifests[0]?.assets).toEqual({ css: ".plain-note{}" });
    expect(manifests[1]?.assets).toEqual({ css: CSS });
    expect(extensionClassAllowlist("emvb-ext-plain")?.has("plain-note")).toBe(true);
    // The live manifest wins for the bundled extension.
    expect(manifests[1]?.elements.map((e) => e.type)).toEqual([TYPE]);
  });
});

describe("each stylesheet once per document (W-1086)", () => {
  test("renders that share a document leave their extension sheets to the assembler", () => {
    rememberExtensions([kit()]);
    rememberExtensionAssets("emvb-ext-kit", { css: CSS, runtime: RUNTIME });
    const apart = renderPage(page(button), emptyDesign(), {
      scope: "page0001",
      separateExtensionCss: true,
    });
    expect(apart.css).not.toContain(CSS);
    expect(apart.extensions).toEqual(["emvb-ext-kit"]);
    expect(apart.runtimes).toContain("ext:emvb-ext-kit");
    expect(extensionStylesheets(["emvb-ext-kit", "emvb-ext-kit", "emvb-ext-none"])).toBe(
      `/* emvb-ext-kit */\n${CSS}\n`,
    );
    expect(renderPage(page(heading), emptyDesign()).extensions).toEqual([]);
  });

  test("an export page with the element in header, footer and body has the sheet once", () => {
    rememberExtensions([kit()]);
    rememberExtensionAssets("emvb-ext-kit", { css: CSS });
    const entireSite = {
      schemaVersion: 1,
      rules: [{ id: "all", op: "include", group: "general", name: "entire_site", args: {} }],
    };
    const out = buildSiteExport({
      design: emptyDesign(),
      parts: [
        { id: "hdr", title: "H", partType: "header", layout: page(button), conditions: entireSite },
        { id: "ftr", title: "F", partType: "footer", layout: page(button), conditions: entireSite },
      ],
      pages: [{ id: "p1", title: "Shop", slug: "shop", layout: page(heading, button) }],
    });
    const css = out.files.find((f) => f.path === "shop/style.css")?.data;
    const html = out.files.find((f) => f.path === "shop/index.html")?.data;
    expect(typeof html === "string" && html.split("kit-btn-primary").length - 1).toBe(3);
    expect(typeof css === "string" && css.split(CSS).length - 1).toBe(1);
  });
});

describe("HTML export (W-1086)", () => {
  test("copies the runtime once for pages that use the element, and the stylesheet into theirs", () => {
    rememberExtensions([kit()]);
    rememberExtensionAssets("emvb-ext-kit", { css: CSS, runtime: RUNTIME });
    const out = buildSiteExport({
      design: emptyDesign(),
      parts: [],
      pages: [
        { id: "p1", title: "Shop", slug: "shop", layout: page(heading, button) },
        { id: "p2", title: "More", slug: "more", layout: page(button) },
        { id: "p3", title: "About", slug: "about", layout: page(heading) },
      ],
    });
    const files = new Map(out.files.map((f) => [f.path, typeof f.data === "string" ? f.data : ""]));
    expect(files.get("assets/ext/emvb-ext-kit.js")).toBe(RUNTIME);
    expect(out.files.filter((f) => f.path === "assets/ext/emvb-ext-kit.js")).toHaveLength(1);
    expect(files.get("shop/index.html")).toContain(
      '<script src="../assets/ext/emvb-ext-kit.js" defer></script>',
    );
    expect(files.get("shop/style.css")).toContain(CSS);
    expect(files.get("shop/index.html")).toContain("kit-btn kit-btn-primary");
    expect(files.get("about/index.html")).not.toContain("emvb-ext-kit.js");
    expect(files.get("about/style.css")).not.toContain(CSS);
  });
});
