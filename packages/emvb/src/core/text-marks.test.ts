import { describe, expect, test } from "bun:test";
import { renderPage } from "./render/index.ts";
import { emptyDesign } from "./schema/design.ts";
import type { Layout, LayoutNode, TextMark } from "./schema/layout.ts";
import { shiftMarks } from "./text-marks.ts";
import { validateLayout } from "./validate.ts";

const page = (node: Record<string, unknown>): Layout => ({
  schemaVersion: 18,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "node0001", ...node } as LayoutNode],
  },
});
const html = (node: Record<string, unknown>) => renderPage(page(node), emptyDesign()).html;
const css = (node: Record<string, unknown>) => renderPage(page(node), emptyDesign()).css;

describe("inline text formatting (W-950)", () => {
  test("bold, italic, colour and links wrap only their words", () => {
    const text = {
      type: "text",
      props: {
        text: "Fast pages, no code.",
        marks: [
          { start: 0, end: 4, bold: true },
          { start: 5, end: 10, italic: true, color: "#ffb000" },
          { start: 12, end: 19, href: "/start" },
        ],
      },
    };
    expect(html(text)).toContain(
      '<p class="emvb-text emvb-e-node0001"><strong>Fast</strong> <em><span class="emvb-mark-c0">pages</span></em>, <a class="emvb-mark-link" href="/start">no code</a>.</p>',
    );
    expect(css(text)).toContain("--emvb-mark-0:#ffb000");
    expect(css(text)).toContain(".emvb-mark-c0{color:var(--emvb-mark-0)}");
  });

  test("overlapping marks split the words where they change; one link stays one link", () => {
    const out = html({
      type: "heading",
      props: {
        text: "Get a free quote",
        level: 2,
        marks: [
          { start: 0, end: 16, href: "/quote", newTab: true },
          { start: 6, end: 10, bold: true },
        ],
      },
    });
    expect(out).toContain(
      '<a class="emvb-mark-link" href="/quote" target="_blank" rel="noopener noreferrer">Get a <strong>free</strong> quote</a>',
    );
    expect(out.match(/<a /g)).toHaveLength(1);
  });

  test("a linked heading keeps formatting but not inner links", () => {
    const out = html({
      type: "heading",
      props: {
        text: "Hello world",
        level: 2,
        href: "/home",
        marks: [{ start: 6, end: 11, bold: true, href: "/elsewhere" }],
      },
    });
    expect(out).toContain(
      '<a class="emvb-heading-link" href="/home">Hello <strong>world</strong></a>',
    );
    expect(out).not.toContain("/elsewhere");
  });

  test("ranges past the text are clipped; unsafe links and colours are left out", () => {
    const out = html({
      type: "text",
      props: {
        text: "Short",
        marks: [
          { start: 2, end: 400, bold: true },
          { start: 0, end: 2, href: "javascript:alert(1)" },
        ],
      },
    });
    expect(out).toContain("Sh<strong>ort</strong>");
    expect(out).not.toContain("javascript");
  });

  test("text without marks renders and styles exactly as before", () => {
    const plain = { type: "text", props: { text: "Plain" } };
    expect(html(plain)).toContain('<p class="emvb-text">Plain</p>');
    expect(css(plain)).not.toContain("emvb-mark");
  });

  test.each([
    [[{ start: 0, end: 2, bold: false }]],
    [[{ start: -1, end: 2, bold: true }]],
    [[{ start: 0, end: 2, color: "red;}x{" }]],
    [[{ start: 0, end: 2, onclick: "x" }]],
    [Array.from({ length: 101 }, () => ({ start: 0, end: 1, bold: true }))],
  ])("refuses %#", (marks) => {
    expect(validateLayout(page({ type: "text", props: { text: "Hello", marks } })).ok).toBe(false);
  });
});

describe("marks follow text edits (W-950)", () => {
  const bold = (start: number, end: number): TextMark => ({ start, end, bold: true });

  test("typing before a mark moves it; inside it grows it; after it leaves it", () => {
    expect(shiftMarks("a gold word", "the gold word", [bold(2, 6)])).toEqual([bold(4, 8)]);
    expect(shiftMarks("a gold word", "a goXld word", [bold(2, 6)])).toEqual([bold(2, 7)]);
    expect(shiftMarks("a gold word", "a golden word", [bold(2, 6)])).toEqual([bold(2, 6)]);
    expect(shiftMarks("a gold word", "a gold! word", [bold(2, 6)])).toEqual([bold(2, 6)]);
    expect(shiftMarks("a gold word", "a xgold word", [bold(2, 6)])).toEqual([bold(3, 7)]);
  });

  test("deleting part of a mark shrinks it; deleting all of it drops it", () => {
    expect(shiftMarks("a gold word", "a go word", [bold(2, 6)])).toEqual([bold(2, 4)]);
    expect(shiftMarks("a gold word", "a  word", [bold(2, 6)])).toEqual([]);
    expect(shiftMarks("a gold word", "", [bold(2, 6)])).toEqual([]);
  });
});
