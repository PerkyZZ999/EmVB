import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { renderPage } from "./index.ts";

const h = (id: string, text: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "heading",
  props: { level: 2, text },
  ...extra,
});

const layout = {
  schemaVersion: 15,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "toc00001", type: "toc", props: {} },
      h("head0001", "Visible"),
      h("head0002", "Arm A", { variant: { test: "t1", arm: "a" } }),
      h("head0003", "Arm B", { variant: { test: "t1", arm: "b" } }),
      h("head0004", "Members only", { audience: { segments: ["member"] } }),
      h("head0005", "First", { htmlId: "dup" }),
      h("head0006", "Second", { htmlId: "dup" }),
    ],
  },
} as unknown as Layout;

const links = (html: string) =>
  [...html.matchAll(/<a href="#([^"]+)">([^<]*)<\/a>/g)].map((m) => `${m[1]}:${m[2]}`);

describe("table of contents lists rendered headings (W-384)", () => {
  test("a hidden A/B arm or audience heading is not listed on the public page", () => {
    const r = renderPage(layout, emptyDesign(), { dynamic: { abArms: { t1: "a" } } as never });
    expect(links(r.html)).toEqual([
      "emvb-h-head0001:Visible",
      "emvb-h-head0002:Arm A",
      "dup:First",
    ]);
    expect(r.html).not.toContain("emvb-h-head0003");
  });

  test("every link points at an element on the page", () => {
    const r = renderPage(layout, emptyDesign(), { dynamic: { abArms: { t1: "b" } } as never });
    for (const link of links(r.html)) expect(r.html).toContain(`id="${link.split(":")[0]}"`);
  });

  test("the editor lists every heading once per id", () => {
    const r = renderPage(layout, emptyDesign(), { mode: "editor" });
    expect(links(r.html)).toEqual([
      "emvb-h-head0001:Visible",
      "emvb-h-head0002:Arm A",
      "emvb-h-head0003:Arm B",
      "emvb-h-head0004:Members only",
      "dup:First",
    ]);
  });
});

describe("headings hidden on every device stay out of the contents (W-409)", () => {
  test("hidden everywhere is left out; hidden on one device stays", () => {
    const page = {
      schemaVersion: 15,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "toc00001", type: "toc", props: {} },
          h("head0001", "Gone", { hiddenOn: ["desktop", "tablet", "mobile"] }),
          h("head0002", "Phones only", { hiddenOn: ["desktop", "tablet"] }),
        ],
      },
    } as unknown as Layout;
    const html = renderPage(page, emptyDesign(), { scope: "p" }).html;
    const toc = html.match(/<nav class="emvb-toc"[^]*?<\/nav>/)?.[0] ?? "";
    expect(toc).not.toContain("Gone");
    expect(toc).toContain("Phones only");
  });
});

describe("a table of contents with no headings (W-430)", () => {
  const empty = {
    schemaVersion: 15,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [{ id: "toc00001", type: "toc", props: { title: "On this page" } }],
    },
  } as unknown as Layout;
  test("is no navigation landmark on the public page", () => {
    const html = renderPage(empty, emptyDesign()).html;
    expect(html).not.toContain("<nav");
    expect(html).not.toContain("On this page");
  });
  test("the editor still shows the hint", () => {
    expect(renderPage(empty, emptyDesign(), { mode: "editor" }).html).toContain(
      "Headings on this page appear here.",
    );
  });
});

describe("headings inside a box hidden on every device stay out of the contents (W-512)", () => {
  test("the hidden box's heading is left out; one in a box hidden on one device stays", () => {
    const page = {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "toc00001", type: "toc", props: {} },
          {
            id: "box00001",
            type: "container",
            props: {},
            hiddenOn: ["desktop", "tablet", "mobile"],
            children: [h("head0001", "Gone")],
          },
          {
            id: "box00002",
            type: "container",
            props: {},
            hiddenOn: ["mobile"],
            children: [h("head0002", "Wide screens")],
          },
        ],
      },
    } as unknown as Layout;
    const html = renderPage(page, emptyDesign(), { scope: "p" }).html;
    const toc = html.match(/<nav class="emvb-toc"[^]*?<\/nav>/)?.[0] ?? "";
    expect(toc).not.toContain("Gone");
    expect(toc).toContain("Wide screens");
  });
});
