import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { auditPage } from "./audit.ts";

const audit = (children: unknown[]) =>
  auditPage(
    {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "head0001", type: "heading", props: { text: "T", level: 1 } },
          ...children,
        ],
      },
    } as Layout,
    emptyDesign(),
  ).issues.map((i) => `${i.rule}:${i.nodeId}`);

describe("W-572: text made only of invisible characters counts as blank", () => {
  test("zero-width heading", () => {
    expect(
      audit([{ id: "head0002", type: "heading", props: { text: "\u200B", level: 2 } }]),
    ).toEqual(["empty-heading:head0002"]);
  });
  test("word-joiner button", () => {
    expect(
      audit([{ id: "butn0001", type: "button", props: { text: "\u2060\uFEFF", href: "/x" } }]),
    ).toContain("link-name:butn0001");
  });
  test("zero-width image alt", () => {
    expect(
      audit([{ id: "imag0001", type: "image", props: { src: "/a.jpg", alt: "\u200B" } }]),
    ).toContain("image-alt:imag0001");
  });
  test("emoji with a joiner is a real name", () => {
    expect(audit([{ id: "head0002", type: "heading", props: { text: "👩‍💻", level: 2 } }])).toEqual(
      [],
    );
  });
});
