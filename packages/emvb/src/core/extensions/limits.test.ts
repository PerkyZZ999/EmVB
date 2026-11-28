import { describe, expect, test } from "bun:test";
import type { LayoutNode } from "../schema/layout.ts";
import { defineExtension } from "./define.ts";
import { extensionCssIssue, extensionRuntimeIssue, normalizeClasses } from "./classes.ts";
import { clearExtensions, rememberExtensions } from "./registry.ts";
import { safeExtensionOutput } from "./safe-nodes.ts";

// extensionApi 1.5 limits, as agreed in #43: 1,024 classes, 512 KB of CSS, 256 KB of script,
// 128 elements per extension, and 200 nodes nested 12 deep for the output of one element. The
// numbers are written out here on purpose: a test that read the constants would pass whatever
// they were changed to.
const KB = 1024;

describe("class allowlist limit", () => {
  const names = (count: number) => Array.from({ length: count }, (_, i) => `kit-c${i}`);

  test("1,024 names are kept, and any past that are dropped", () => {
    expect(normalizeClasses({ prefix: "kit-", allow: names(1024) })?.allow).toHaveLength(1024);
    expect(normalizeClasses({ prefix: "kit-", allow: names(1025) })?.allow).toHaveLength(1024);
  });
});

describe("stylesheet and script size limits", () => {
  test("a stylesheet of 512 KB is accepted and one byte more is refused", () => {
    expect(extensionCssIssue("x".repeat(512 * KB))).toBeUndefined();
    expect(extensionCssIssue("x".repeat(512 * KB + 1))).toBe(
      "the stylesheet is larger than 512 KB",
    );
  });

  test("a script of 256 KB is accepted and one byte more is refused", () => {
    expect(extensionRuntimeIssue("x".repeat(256 * KB))).toBeUndefined();
    expect(extensionRuntimeIssue("x".repeat(256 * KB + 1))).toBe(
      "the runtime is larger than 256 KB",
    );
  });
});

describe("elements per extension limit", () => {
  const element = (name: string) => ({
    name,
    label: name,
    schema: { type: "object" as const, properties: {} },
    fields: [],
    defaults: () => ({}),
    render: () => [],
  });
  const registered = (count: number) => {
    clearExtensions();
    const elements = Array.from({ length: count }, (_, i) => element(`el-${i}`));
    const manifests = rememberExtensions([
      defineExtension({ id: "emvb-ext-many", label: "Many", elements }),
    ]);
    clearExtensions();
    return manifests[0]?.elements.length;
  };

  test("128 elements are registered, and any past that are ignored", () => {
    expect(registered(128)).toBe(128);
    expect(registered(129)).toBe(128);
  });
});

describe("output of one element: 200 nodes, nested 12 deep", () => {
  const text = (i: number) => ({ type: "text", props: { text: `t${i}` } });
  const count = (nodes: readonly LayoutNode[]): number =>
    nodes.reduce(
      (sum, node) => sum + 1 + count((node as { children?: LayoutNode[] }).children ?? []),
      0,
    );
  /** Levels in the deepest chain of the output. */
  const levels = (nodes: readonly LayoutNode[]): number =>
    nodes.reduce(
      (deepest, node) =>
        Math.max(deepest, 1 + levels((node as { children?: LayoutNode[] }).children ?? [])),
      0,
    );
  /** A chain of `n` nested containers. */
  const chain = (n: number): unknown => ({
    type: "container",
    props: {},
    children: n > 1 ? [chain(n - 1)] : [],
  });

  test("200 nodes are kept, and any past that are dropped", () => {
    const of = (n: number) => safeExtensionOutput(Array.from({ length: n }, (_, i) => text(i)));
    expect(count(of(200))).toBe(200);
    expect(count(of(201))).toBe(200);
  });

  test("a chain 13 levels deep is kept whole, and a level past that is dropped", () => {
    expect(levels(safeExtensionOutput([chain(13)]))).toBe(13);
    expect(levels(safeExtensionOutput([chain(14)]))).toBe(13);
  });
});
