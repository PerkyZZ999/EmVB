import { beforeEach, describe, expect, test } from "bun:test";
import { buildSiteExport } from "../export/site.ts";
import { renderPage } from "../render/index.ts";
import { emptyDesign } from "../schema/design.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout } from "../schema/layout.ts";
import { filterExtensionVars, normalizeClasses } from "./classes.ts";
import { defineExtension } from "./define.ts";
import { clearExtensions, extensionVarRule, rememberExtensions } from "./registry.ts";
import { extensionVarsOf, safeExtensionOutput, withExtensionClasses } from "./safe-nodes.ts";
import type { ExtensionOutputNode } from "./types.ts";

// extensionApi 1.5: `extVars`, CSS custom properties on an extension's output node.
const TYPE = "ext:emvb-ext-kit/ring";
const rule = { prefix: "kit-", vars: new Set(["--fixed-name"]) };
const ring = (extVars: Record<string, string>, extra: Partial<ExtensionOutputNode> = {}) =>
  ({
    id: "ring0001",
    type: "heading",
    props: { text: "70%", level: 2 },
    extClasses: ["kit-ring"],
    extVars,
    ...extra,
  }) as ExtensionOutputNode;
const kit = (
  extVars: Record<string, string>,
  classes: { prefix: string; allow: string[]; vars?: string[] } | null = {
    prefix: "kit-",
    allow: ["kit-ring"],
    vars: ["--fixed-name"],
  },
) =>
  defineExtension({
    id: "emvb-ext-kit",
    ...(classes ? { classes } : {}),
    elements: [
      {
        name: "ring",
        label: "Ring",
        schema: { type: "object", properties: {} },
        fields: [],
        render: () => ring(extVars),
      },
    ],
  });
const page = (...children: Layout["root"]["children"]): Layout => ({
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: { id: "root0001", type: "container", props: {}, children },
});
const use = { id: "ext00001", type: TYPE, props: {} };
const ruleOf = (css: string, id: string): string | undefined =>
  css.match(new RegExp(`\\.emvb-e-${id}\\{[^}]*\\}`))?.[0];
beforeEach(() => clearExtensions());

describe("which extVars an output node keeps", () => {
  test("names under the prefix and listed names, with safe string values", () => {
    expect(
      filterExtensionVars(
        { "--kit-value": "70", "--fixed-name": "1.5rem", "--kit-x-y": "a b" },
        rule,
      ),
    ).toEqual({ "--kit-value": "70", "--fixed-name": "1.5rem", "--kit-x-y": "a b" });
  });

  test("a name outside the prefix and the list is dropped, so it cannot set a site variable", () => {
    expect(
      filterExtensionVars({ "--color-primary": "red", "--other": "1", color: "red" }, rule),
    ).toEqual({});
  });

  test("the bare prefix, uppercase, emvb names and a leading digit are not names", () => {
    expect(
      filterExtensionVars(
        { "--kit-": "1", "--kit-A": "1", "--emvb-x": "1", "--kit-ok": "1", "-kit-x": "1" },
        { prefix: "kit-", vars: new Set(["--emvb-listed"]) },
      ),
    ).toEqual({ "--kit-ok": "1" });
  });

  test("values are checked like style values: no braces, quotes, url(), comments, newlines or long text", () => {
    const bad = ["}", "a;b", 'x"y', "url(x)", "/*c*/", "a\nb", "<b>", "a".repeat(201), "", 7, null];
    for (const value of bad) {
      expect(filterExtensionVars({ "--kit-v": value }, rule)).toEqual({});
    }
    expect(filterExtensionVars({ "--kit-v": "a".repeat(200) }, rule)).toEqual({
      "--kit-v": "a".repeat(200),
    });
  });

  test("at most 16 stay, and a non-object or no rule keeps nothing", () => {
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, n) => [`--kit-v${n}`, "1"]));
    expect(Object.keys(filterExtensionVars(many, rule))).toHaveLength(16);
    expect(filterExtensionVars("--kit-v: 1", rule)).toEqual({});
    expect(filterExtensionVars([["--kit-v", "1"]], rule)).toEqual({});
    expect(filterExtensionVars({ "--kit-v": "1" }, undefined)).toEqual({});
  });
});

describe("the vars list in the class allowlist", () => {
  test("valid listed names are kept, the rest are dropped one by one", () => {
    expect(
      normalizeClasses({
        prefix: "kit-",
        allow: ["kit-a"],
        vars: ["--fixed-name", "color", "--EMVB", "--emvb-x", "--Bad", 5, "--fixed-name"],
      }),
    ).toEqual({ prefix: "kit-", allow: ["kit-a"], vars: ["--fixed-name"] });
  });

  test("no vars list, or a list with nothing valid, leaves the allowlist as it was", () => {
    expect(normalizeClasses({ prefix: "kit-", allow: ["kit-a"] })).toEqual({
      prefix: "kit-",
      allow: ["kit-a"],
    });
    expect(normalizeClasses({ prefix: "kit-", allow: ["kit-a"], vars: ["x", 1] })).toEqual({
      prefix: "kit-",
      allow: ["kit-a"],
    });
  });

  test("the registry keeps the rule next to the class allowlist, and clears it with it", () => {
    rememberExtensions([kit({})]);
    expect(extensionVarRule("emvb-ext-kit")?.prefix).toBe("kit-");
    expect([...(extensionVarRule("emvb-ext-kit")?.vars ?? [])]).toEqual(["--fixed-name"]);
    rememberExtensions([kit({}, null)]);
    expect(extensionVarRule("emvb-ext-kit")).toBeUndefined();
  });

  test("clearing the extensions clears the rule, so a removed extension sets nothing", () => {
    rememberExtensions([kit({})]);
    clearExtensions();
    expect(extensionVarRule("emvb-ext-kit")).toBeUndefined();
  });
});

describe("extVars on a rendered page", () => {
  test("they go into the node's own rule, not a style attribute", () => {
    rememberExtensions([kit({ "--kit-value": "70" })]);
    const out = renderPage(page(use), emptyDesign());
    expect(ruleOf(out.css, "ring0001")).toBe(".emvb-e-ring0001{--kit-value:70}");
    expect(out.html).toContain("emvb-e-ring0001");
    expect(out.html).not.toContain("style=");
    expect(out.html).not.toContain("--kit-value");
  });

  test("an unknown name, an unsafe value and a plain property never reach the page", () => {
    rememberExtensions([
      kit({
        "--kit-value": "70",
        "--color-primary": "red",
        "--kit-url": "url(https://x.test/a.png)",
        "--kit-brace": "}body{display:none",
        color: "red",
      }),
    ]);
    const out = renderPage(page(use), emptyDesign());
    expect(ruleOf(out.css, "ring0001")).toBe(".emvb-e-ring0001{--kit-value:70}");
    for (const leak of ["color-primary", "x.test", "}body{", "color:red"]) {
      expect(out.css).not.toContain(leak);
    }
  });

  test("a different value gives a different rule, so a live value is a server render away", () => {
    rememberExtensions([kit({ "--kit-value": "42" })]);
    expect(ruleOf(renderPage(page(use), emptyDesign()).css, "ring0001")).toBe(
      ".emvb-e-ring0001{--kit-value:42}",
    );
  });

  test("an extension with no class prefix cannot set any variable", () => {
    rememberExtensions([kit({ "--kit-value": "70" }, null)]);
    const out = renderPage(page(use), emptyDesign());
    expect(out.css).not.toContain("--kit-value");
    expect(ruleOf(out.css, "ring0001")).toBeUndefined();
  });

  test("the HTML export carries them in the page's stylesheet", () => {
    rememberExtensions([kit({ "--kit-value": "70" })]);
    const out = buildSiteExport({
      design: emptyDesign(),
      parts: [],
      pages: [{ id: "p1", title: "Shop", slug: "shop", layout: page(use) }],
    });
    const files = new Map(out.files.map((f) => [f.path, typeof f.data === "string" ? f.data : ""]));
    expect(files.get("shop/style.css")).toContain(".emvb-e-ring0001{--kit-value:70}");
    expect(files.get("shop/index.html")).not.toContain("style=");
  });
});

describe("extVars for the editor", () => {
  const classes = new Set(["kit-ring"]);
  test("the server hands them to the admin in extVars, and the admin checks them again", () => {
    const nodes = safeExtensionOutput(
      ring({ "--kit-value": "70", "--other": "1" }),
      Math.random,
      classes,
      rule,
    );
    expect(extensionVarsOf(nodes[0] as object)).toEqual({ "--kit-value": "70" });
    const json = withExtensionClasses(nodes) as { extVars?: unknown }[];
    expect(json[0]?.extVars).toEqual({ "--kit-value": "70" });
    // The admin gets the JSON back and runs it through the same check with its own rule.
    const again = safeExtensionOutput(json[0], Math.random, classes, rule);
    expect(extensionVarsOf(again[0] as object)).toEqual({ "--kit-value": "70" });
  });

  test("the admin's check drops what the server's check would drop", () => {
    const hostile = {
      ...ring({}),
      extVars: { "--kit-value": "70", "--other": "1", "--kit-x": "}" },
    };
    const nodes = safeExtensionOutput(hostile, Math.random, classes, rule);
    expect(extensionVarsOf(nodes[0] as object)).toEqual({ "--kit-value": "70" });
  });

  test("without a rule the admin keeps none", () => {
    const nodes = safeExtensionOutput(ring({ "--kit-value": "70" }), Math.random, classes);
    expect(extensionVarsOf(nodes[0] as object)).toBeUndefined();
  });

  test("output with no extVars carries none", () => {
    const nodes = safeExtensionOutput(ring({}), Math.random, classes, rule);
    expect(extensionVarsOf(nodes[0] as object)).toBeUndefined();
    expect((withExtensionClasses(nodes) as { extVars?: unknown }[])[0]?.extVars).toBeUndefined();
  });
});
