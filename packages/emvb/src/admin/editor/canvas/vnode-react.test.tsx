import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { emptyDesign, renderPage, sanitizeSvgMarkup, type Layout } from "../../../core/index.ts";
import { cleanup, mount } from "../../../../test/dom/mount.ts";
import { revealInTabs, tabPanelIdForLabel } from "./tab-reveal.ts";
import { vnodeToReact } from "./vnode-react.tsx";

afterEach(cleanup);

const panel = (id: string, label: string, children: Layout["root"]["children"]) => ({
  id,
  type: "tab-panel" as const,
  props: { label },
  children,
});
const heading = (id: string, text: string) => ({
  id,
  type: "heading" as const,
  props: { text, level: 3 as const },
});

/** Outer tabs whose third panel holds inner tabs. */
const layout = {
  schemaVersion: 6,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      {
        id: "tabs0001",
        type: "tabs",
        props: {},
        children: [
          panel("tpa00001", "First", [heading("tha00001", "One")]),
          panel("tpb00001", "Second", [heading("thb00001", "Two")]),
          panel("tpc00001", "Third", [
            {
              id: "tabs0002",
              type: "tabs",
              props: {},
              children: [
                panel("ipa00001", "Inner first", [heading("iha00001", "Inner one")]),
                panel("ipb00001", "Inner second", [heading("ihb00001", "Inner two")]),
              ],
            },
          ]),
        ],
      },
    ],
  },
} as Layout;

const editorVnode = () => renderPage(layout, emptyDesign(), { mode: "editor" }).vnode;

/** Index of the checked radio in each tabs group, outer first. */
const checked = () =>
  [...document.querySelectorAll(".emvb-tabs")].map((tabs) =>
    [...tabs.querySelectorAll<HTMLInputElement>(":scope > .emvb-tab-input")].findIndex(
      (input) => input.checked,
    ),
  );

describe("canvas vnode rendering (QA-5, QA-6)", () => {
  test("SVG attributes and tags reach the canvas DOM under their real names, with no React warnings", async () => {
    const errors = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const svg = sanitizeSvgMarkup(
        '<svg viewBox="0 0 20 20" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><linearGradient id="g"><stop offset="0" stop-color="blue" stop-opacity="0.5"/></linearGradient><radialGradient id="r"/><clipPath id="c"><rect width="1" height="1"/></clipPath><symbol id="s"/></defs><use xlink:href="#s"/><rect fill="url(#g)" fill-opacity="0.8" stroke-dasharray="2 1" stroke-opacity="0.5" clip-path="url(#c)"/><text font-size="4" font-family="serif" font-weight="700" text-anchor="start" dominant-baseline="auto">Hi</text></svg>',
      );
      if (!svg) throw new Error("expected markup to pass the sanitizer");
      const host = await mount(<div>{vnodeToReact(svg)}</div>);
      const root = host.querySelector("svg");
      expect([...(root?.querySelectorAll("*") ?? [])].map((el) => el.localName).toSorted()).toEqual(
        [
          "clipPath",
          "defs",
          "linearGradient",
          "radialGradient",
          "rect",
          "rect",
          "stop",
          "symbol",
          "text",
          "use",
        ].toSorted(),
      );
      const attrs = (selector: string) =>
        [...(root?.querySelector(selector)?.attributes ?? [])].map((a) => a.name).toSorted();
      expect(attrs("stop")).toEqual(["offset", "stop-color", "stop-opacity"]);
      expect(attrs("rect[fill]")).toEqual([
        "clip-path",
        "fill",
        "fill-opacity",
        "stroke-dasharray",
        "stroke-opacity",
      ]);
      expect(attrs("text")).toEqual([
        "dominant-baseline",
        "font-family",
        "font-size",
        "font-weight",
        "text-anchor",
      ]);
      expect(attrs("use")).toEqual(["xlink:href"]);
      expect(errors.mock.calls.map((call) => String(call[0]))).toEqual([]);
    } finally {
      errors.mockRestore();
    }
  });

  test("a tab radio is only checked to begin with, so another tab can be chosen", async () => {
    const errors = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await mount(<div>{vnodeToReact(editorVnode())}</div>);
      expect(checked()).toEqual([0, 0]);
      const second = document.querySelectorAll<HTMLInputElement>(".emvb-tab-input")[1];
      await act(async () => second?.click());
      expect(checked()).toEqual([1, 0]);
      expect(errors.mock.calls.map((call) => String(call[0]))).toEqual([]);
    } finally {
      errors.mockRestore();
    }
  });
});

describe("revealing an element inside tabs (QA-5)", () => {
  const load = () => {
    const { html } = renderPage(layout, emptyDesign(), { mode: "editor" });
    document.body.innerHTML = html;
  };

  test.each([
    ["tpb00001", [1, 0]],
    ["thb00001", [1, 0]],
    ["tpc00001", [2, 0]],
    ["ihb00001", [2, 1]],
    ["ipb00001", [2, 1]],
    ["tabs0001", [0, 0]],
    ["gone0001", [0, 0]],
  ] as const)("selecting %p shows tabs %p", (id, expected) => {
    load();
    revealInTabs(document, id);
    expect(checked()).toEqual([...expected]);
  });

  test("a tab label stands for its panel; anything else stands for nothing", () => {
    load();
    const labels = [...document.querySelectorAll(".emvb-tab-label")];
    expect(labels.map((label) => tabPanelIdForLabel(label))).toEqual([
      "tpa00001",
      "tpb00001",
      "tpc00001",
      "ipa00001",
      "ipb00001",
    ]);
    expect(tabPanelIdForLabel(document.querySelector("h3"))).toBeNull();
    expect(tabPanelIdForLabel(null)).toBeNull();
  });
});
