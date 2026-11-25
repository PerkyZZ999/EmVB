import { beforeEach, describe, expect, test } from "bun:test";
import { buildSiteExport } from "../export/site.ts";
import { renderPage } from "../render/index.ts";
import { emptyDesign } from "../schema/design.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout } from "../schema/layout.ts";
import { filterExtensionVars, isExtensionVarValue, normalizeClasses } from "./classes.ts";
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
  test("names under the prefix and listed names, with a value of an agreed form", () => {
    expect(
      filterExtensionVars(
        { "--kit-value": "70", "--fixed-name": "1.5rem", "--kit-x-y": "#1a2b3c" },
        rule,
      ),
    ).toEqual({ "--kit-value": "70", "--fixed-name": "1.5rem", "--kit-x-y": "#1a2b3c" });
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

  test("a number, length, percentage, angle or colour is accepted, one example per form", () => {
    const accepted: Record<string, string> = {
      number: "70",
      "negative number": "-1.5",
      "leading-dot number": ".5",
      length: "1.5rem",
      "length in px": "12px",
      "viewport length": "50vw",
      percentage: "50%",
      angle: "90deg",
      "angle in turns": ".25turn",
      "short hex colour": "#fff",
      "hex colour": "#1a2b3c",
      "hex colour with alpha": "#1a2b3c80",
      "colour keyword": "transparent",
      "currentcolor keyword": "currentColor",
      "rgb with slash alpha": "rgb(0 0 0 / 50%)",
      "rgba with commas": "rgba(0, 0, 0, .5)",
      hsl: "hsl(120deg 50% 50%)",
      oklch: "oklch(70% 0.2 150)",
      "oklch with alpha": "oklch(70% 0.2 150 / 0.5)",
    };
    for (const [form, value] of Object.entries(accepted)) {
      expect({ form, ok: isExtensionVarValue(value) }).toEqual({ form, ok: true });
      expect(filterExtensionVars({ "--kit-v": value }, rule)).toEqual({ "--kit-v": value });
    }
  });

  test("a plain token sequence is dropped, because it is not one value", () => {
    for (const value of ["a b", "70px 2", "1px solid red", "0 0 4px #000", "70 80", "red blue"]) {
      expect({ value, ok: isExtensionVarValue(value) }).toEqual({ value, ok: false });
      expect(filterExtensionVars({ "--kit-v": value }, rule)).toEqual({});
    }
  });

  test("a keyword, var(), calc(), an exponent, an unknown unit or a half-written colour is dropped", () => {
    const bad = [
      "red",
      "auto",
      "var(--x)",
      "calc(1px + 2px)",
      "1e3",
      "12pt",
      "12 px",
      "px",
      "#ggg",
      "#12345",
      "rgb(0 0)",
      "rgb(0 0 0 0 0)",
      "rgb(0 0 0 /)",
      "50%%",
      " 70",
      "70 ",
    ];
    for (const value of bad)
      expect({ value, ok: isExtensionVarValue(value) }).toEqual({ value, ok: false });
  });

  test("a value that could leave its rule is dropped before its form is looked at", () => {
    const bad = [
      "}",
      "a;b",
      'x"y',
      "url(x)",
      "/*c*/",
      "a\nb",
      "<b>",
      "70;color:red",
      "70}body{x:1",
      "",
      7,
      null,
    ];
    for (const value of bad) expect(filterExtensionVars({ "--kit-v": value }, rule)).toEqual({});
  });

  test("a value of an agreed form is still dropped when it is too long or ends in a newline", () => {
    // Each of these matches a form on its own; only the style value check stops them.
    expect(filterExtensionVars({ "--kit-v": "1".repeat(200) }, rule)).toEqual({
      "--kit-v": "1".repeat(200),
    });
    for (const value of ["1".repeat(201), "1".repeat(250), "70\n", "70\r\n"]) {
      expect(filterExtensionVars({ "--kit-v": value }, rule)).toEqual({});
    }
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

  test("an extension with no class but a vars list keeps its allowlist and its rule", () => {
    expect(normalizeClasses({ prefix: "kit-", allow: [], vars: ["--fixed-name"] })).toEqual({
      prefix: "kit-",
      allow: [],
      vars: ["--fixed-name"],
    });
    rememberExtensions([kit({}, { prefix: "kit-", allow: [], vars: ["--fixed-name"] })]);
    expect(extensionVarRule("emvb-ext-kit")?.prefix).toBe("kit-");
    expect([...(extensionVarRule("emvb-ext-kit")?.vars ?? [])]).toEqual(["--fixed-name"]);
  });

  test("no class and no valid variable still leaves nothing, and so does a refused prefix", () => {
    expect(normalizeClasses({ prefix: "kit-", allow: [] })).toBeUndefined();
    expect(normalizeClasses({ prefix: "kit-", allow: [], vars: ["color", 5] })).toBeUndefined();
    expect(normalizeClasses({ prefix: "Kit", allow: [], vars: ["--fixed-name"] })).toBeUndefined();
    expect(normalizeClasses({ prefix: "kit-", allow: ["other"] })).toBeUndefined();
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

  test("a variable-only extension sets its declared variables on the page, with no placeholder class", () => {
    rememberExtensions([
      kit(
        { "--fixed-name": "70", "--kit-value": "1", "--other": "2" },
        { prefix: "kit-", allow: [], vars: ["--fixed-name"] },
      ),
    ]);
    const out = renderPage(page(use), emptyDesign());
    // The declared name and a name under the prefix are kept; an undeclared one is dropped.
    expect(ruleOf(out.css, "ring0001")).toBe(".emvb-e-ring0001{--fixed-name:70;--kit-value:1}");
    expect(out.css).not.toContain("--other");
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
