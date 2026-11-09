import { beforeEach, describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout } from "../schema/layout.ts";
import { renderPage } from "../render/index.ts";
import { validateLayout } from "../validate.ts";
import { defineExtension } from "./define.ts";
import { clearExtensions, liveElement, rememberExtensions } from "./registry.ts";
import { extensionNamespaceIssue, extensionType, parseExtensionType } from "./namespace.ts";
import { validateExtensionProps } from "./schema.ts";
import { safeExtensionOutput } from "./safe-nodes.ts";
import { EXTENSION_PLACEHOLDER_TEXT, extensionPlaceholderLabel } from "./placeholder.ts";

const hello = () =>
  defineExtension({
    id: "emvb-ext-hello",
    label: "Hello",
    elements: [
      {
        name: "greeting",
        label: "Greeting",
        schema: {
          type: "object",
          properties: {
            text: { type: "string", maxLength: 80, default: "Hi" },
          },
        },
        fields: [{ key: "text", kind: "text", label: "Text" }],
        defaults: () => ({ text: "Hi" }),
        render: (props) => ({
          id: "head0001",
          type: "heading",
          props: { text: String(props.text ?? "Hi"), level: 2 },
        }),
      },
    ],
    panels: [
      {
        name: "about",
        label: "About Hello",
        description: "Sample panel",
        source: "site-info",
      },
    ],
    sources: [
      {
        name: "site-info",
        label: "Site info",
        capabilities: ["text"],
        resolve: () => ({ title: "EmVB", tagline: "sample" }),
      },
    ],
  });

const pageWith = (type: string, props: Record<string, unknown> = {}): Layout => ({
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "ext00001", type, props }],
  },
});

beforeEach(() => {
  clearExtensions();
});

describe("namespace (W-927)", () => {
  test("accepts ext:pkg/name and builds the type", () => {
    expect(extensionType("emvb-ext-hello", "greeting")).toBe("ext:emvb-ext-hello/greeting");
    expect(parseExtensionType("ext:emvb-ext-hello/greeting")).toEqual({
      pkg: "emvb-ext-hello",
      name: "greeting",
    });
  });

  test("refuses path escape, extra colons, HTML and built-in collisions", () => {
    expect(extensionNamespaceIssue("ext:../admin/x")).toBeDefined();
    expect(extensionNamespaceIssue("ext:hello:world/x")).toBeDefined();
    expect(extensionNamespaceIssue("ext:hello/<script>/x")).toBeDefined();
    expect(extensionNamespaceIssue("heading")).toMatch(/ext:/);
    expect(extensionType("heading", "x")).toBeUndefined();
  });
});

describe("registration and render (W-927)", () => {
  test("rememberExtensions registers the greeting element", () => {
    const manifests = rememberExtensions([hello()]);
    expect(manifests).toHaveLength(1);
    expect(manifests[0]?.elements[0]?.type).toBe("ext:emvb-ext-hello/greeting");
    expect(liveElement("ext:emvb-ext-hello/greeting")?.element.name).toBe("greeting");
  });

  test("a registered greeting renders its heading text", () => {
    rememberExtensions([hello()]);
    const result = renderPage(
      pageWith("ext:emvb-ext-hello/greeting", { text: "Welcome" }),
      emptyDesign(),
      {
        mode: "public",
      },
    );
    expect(result.html).toContain("Welcome");
    expect(result.html).toContain("emvb-ext");
    expect(result.html).not.toContain(EXTENSION_PLACEHOLDER_TEXT);
  });

  test("a missing extension keeps the page valid and shows a placeholder", () => {
    const stored = pageWith("ext:emvb-ext-hello/greeting", { text: "Welcome" });
    const validated = validateLayout(stored);
    expect(validated.ok).toBe(true);

    const publicPage = renderPage(stored, emptyDesign(), { mode: "public" });
    expect(publicPage.html).toContain(EXTENSION_PLACEHOLDER_TEXT);
    expect(publicPage.html).toContain("emvb-ext-missing");
    expect(publicPage.html).not.toContain("Welcome");

    const editorPage = renderPage(stored, emptyDesign(), { mode: "editor" });
    expect(editorPage.html).toContain(extensionPlaceholderLabel("ext:emvb-ext-hello/greeting"));
  });

  test("a throwing render becomes the placeholder and leaves siblings alone", () => {
    rememberExtensions([
      defineExtension({
        id: "emvb-ext-hello",
        elements: [
          {
            name: "greeting",
            label: "Greeting",
            schema: { type: "object", properties: {} },
            fields: [],
            render: () => {
              throw new Error("boom");
            },
          },
        ],
      }),
    ]);
    const layout: Layout = {
      schemaVersion: LAYOUT_SCHEMA_VERSION,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "head0001", type: "heading", props: { text: "Sibling", level: 2 } },
          { id: "ext00001", type: "ext:emvb-ext-hello/greeting", props: {} },
        ],
      },
    };
    const result = renderPage(layout, emptyDesign(), { mode: "public" });
    expect(result.html).toContain("Sibling");
    expect(result.html).toContain(EXTENSION_PLACEHOLDER_TEXT);
  });
});

describe("security: injection and size (W-927)", () => {
  test("raw HTML from render is refused; the placeholder shows instead", () => {
    rememberExtensions([
      defineExtension({
        id: "emvb-ext-hello",
        elements: [
          {
            name: "greeting",
            label: "Greeting",
            schema: { type: "object", properties: {} },
            fields: [],
            render: () => "<script>alert(1)</script>" as never,
          },
        ],
      }),
    ]);
    const result = renderPage(pageWith("ext:emvb-ext-hello/greeting"), emptyDesign(), {
      mode: "public",
    });
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain(EXTENSION_PLACEHOLDER_TEXT);
  });

  test("a returned node with a style injection attempt is stripped by layout validation", () => {
    const nodes = safeExtensionOutput({
      id: "head0001",
      type: "heading",
      props: { text: "Safe", level: 2 },
      style: { color: "red; } body{display:none" },
    });
    // Style on extension output is dropped by coerce; only props survive.
    expect(nodes).toHaveLength(1);
    expect(nodes[0] && "style" in nodes[0] ? nodes[0].style : undefined).toBeUndefined();
  });

  test("a javascript: image src from render never reaches HTML", () => {
    rememberExtensions([
      defineExtension({
        id: "emvb-ext-hello",
        elements: [
          {
            name: "greeting",
            label: "Greeting",
            schema: { type: "object", properties: {} },
            fields: [],
            render: () => ({
              id: "img00001",
              type: "image",
              props: { src: "javascript:alert(1)", alt: "x", decorative: false },
            }),
          },
        ],
      }),
    ]);
    const result = renderPage(pageWith("ext:emvb-ext-hello/greeting"), emptyDesign(), {
      mode: "public",
    });
    expect(result.html).not.toContain("javascript:");
  });

  test("oversized prop strings are refused by the extension schema", () => {
    const schema = {
      type: "object" as const,
      properties: { text: { type: "string" as const, maxLength: 10 } },
    };
    const ok = validateExtensionProps(schema, { text: "short" });
    expect(ok.ok).toBe(true);
    const big = validateExtensionProps(schema, { text: "x".repeat(11) });
    expect(big.ok).toBe(false);
  });

  test("namespace escape in a stored type never executes and shows the placeholder", () => {
    expect(extensionNamespaceIssue("ext:../evil/x")).toBeDefined();
    const stored = pageWith("ext:../evil/x", { html: "<script>" });
    expect(validateLayout(stored).ok).toBe(true);
    const result = renderPage(stored, emptyDesign(), { mode: "public" });
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain(EXTENSION_PLACEHOLDER_TEXT);
    // Public copy does not echo the hostile type string.
    expect(result.html).not.toContain("../evil");
  });
});
