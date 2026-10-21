import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import { createVariantB } from "../arrange.ts";
import { findNode } from "../tree-ops.ts";
import { validateLayout } from "../validate.ts";
import { applyA11yFix, applyAllA11yFixes, auditPage, contrastRatio } from "./audit.ts";

const h = (id: string, level: number, extra: Partial<LayoutNode> = {}) =>
  ({ id, type: "heading", props: { text: "T", level }, ...extra }) as LayoutNode;
const page = (...children: LayoutNode[]): Layout =>
  ({
    schemaVersion: 17,
    root: { id: "root0001", type: "container", props: {}, children },
  }) as Layout;
const rules = (layout: Layout) =>
  auditPage(layout, emptyDesign()).issues.map((i) => `${i.rule}:${i.nodeId}`);

describe("accessibility co-pilot (W-317)", () => {
  test("a clean page scores 100", () => {
    const report = auditPage(page(h("head0001", 1), h("head0002", 2)), emptyDesign());
    expect(report).toEqual({ score: 100, issues: [] });
  });

  test("heading order: skipped levels, a second H1 and no H1 are flagged, with fixes", () => {
    const layout = page(h("head0001", 1), h("head0002", 4), h("head0003", 1));
    expect(rules(layout)).toEqual(["heading-order:head0002", "multiple-h1:head0003"]);
    const fixed = applyAllA11yFixes(layout, auditPage(layout, emptyDesign()).issues);
    expect(rules(fixed)).toEqual([]);
    expect(findNode(fixed, "head0002")?.props).toMatchObject({ level: 2 });
    expect(rules(page(h("head0001", 2)))).toEqual(["no-h1:root0001"]);
  });

  test("file-name alt text is flagged and Mark as decorative fixes it", () => {
    const img = {
      id: "imag0001",
      type: "image",
      props: { src: "/a.jpg", alt: "IMG_2041.jpg" },
    } as LayoutNode;
    const layout = page(h("head0001", 1), img);
    const [issue] = auditPage(layout, emptyDesign()).issues;
    expect(issue?.rule).toBe("image-alt");
    const fixed = applyA11yFix(layout, issue as NonNullable<typeof issue>);
    expect(findNode(fixed, "imag0001")?.props).toMatchObject({ decorative: true });
    expect(validateLayout(fixed).ok).toBe(true);
  });

  test("contrast uses the nearest background, site colour variables and large-text rules", () => {
    expect(Math.round(contrastRatio("#000000", "#ffffff"))).toBe(21);
    const design = {
      ...emptyDesign(),
      variables: {
        ...emptyDesign().variables,
        colors: [{ id: "pale", name: "Pale", value: "#eeeeee" }],
      },
    };
    const text = {
      id: "text0001",
      type: "text",
      props: { text: "Hi" },
      style: { color: { var: "pale" } },
    } as LayoutNode;
    const box = {
      id: "box00001",
      type: "container",
      props: {},
      style: { backgroundColor: "#ffffff" },
      children: [text],
    } as LayoutNode;
    const report = auditPage(page(h("head0001", 1), box), design);
    expect(report.issues.map((i) => i.rule)).toEqual(["contrast"]);
    expect(report.issues[0]?.fix).toEqual({ kind: "text-color", color: "#111111" });
    // #767676 on white is 4.54:1: fine for body text.
    const ok = { ...text, style: { color: "#767676" } } as LayoutNode;
    expect(
      auditPage(page(h("head0001", 1), { ...box, children: [ok] } as LayoutNode), design).issues,
    ).toEqual([]);
    // Behind a background image the colour can't be judged.
    const photo = {
      ...box,
      style: { backgroundColor: "#ffffff", backgroundImage: { url: "/a.jpg" } },
    } as unknown as LayoutNode;
    expect(auditPage(page(h("head0001", 1), photo), design).issues).toEqual([]);
    // Nor behind a gradient or a video (W-633).
    for (const cover of [
      {
        gradient: {
          kind: "linear",
          angle: 90,
          stops: [
            { color: "#000000", at: 0 },
            { color: "#111111", at: 100 },
          ],
        },
      },
      { backgroundVideo: "/a.mp4" },
    ]) {
      const dark = {
        ...box,
        style: { backgroundColor: "#ffffff", ...cover },
      } as unknown as LayoutNode;
      expect(auditPage(page(h("head0001", 1), dark), design).issues).toEqual([]);
    }
  });

  test("links: vague text, unannounced new tabs and aria-hidden on focusable elements", () => {
    const link = (id: string, text: string, extra: Record<string, unknown> = {}) =>
      ({ id, type: "link", props: { text, href: "/x", ...extra } }) as LayoutNode;
    const hidden = {
      ...link("link0003", "Pricing"),
      attributes: [{ name: "aria-hidden", value: "true" }],
    } as LayoutNode;
    const layout = page(
      h("head0001", 1),
      link("link0001", "Click here"),
      link("link0002", "Docs", { newTab: true }),
      hidden,
    );
    expect(rules(layout)).toEqual([
      "vague-link:link0001",
      "new-tab:link0002",
      "hidden-focusable:link0003",
    ]);
    const report = auditPage(layout, emptyDesign());
    expect(report.score).toBe(100 - 4 - 4 - 12);
    const fixed = applyA11yFix(layout, report.issues[2] as NonNullable<(typeof report.issues)[2]>);
    expect(findNode(fixed, "link0003")?.attributes).toBeUndefined();
  });

  test("W-317 A/B variants are alternatives: their H1s count once", () => {
    const made = createVariantB(page(h("head0001", 1), h("head0002", 2)), "head0001");
    if (!made.ok) throw new Error(made.reason);
    expect(rules(made.layout)).toEqual([]);
    // A third H1 after the pair is still a second H1 on every visit.
    const extra = createVariantB(page(h("head0001", 1), h("head0003", 1)), "head0001");
    if (!extra.ok) throw new Error(extra.reason);
    expect(rules(extra.layout)).toEqual(["multiple-h1:head0003"]);
  });
});

test("W-637: contrast reads colours set by global classes, the element's own style winning", () => {
  const design = {
    ...emptyDesign(),
    classes: [
      { id: "dark", name: "dark", style: { backgroundColor: "#111111" } },
      { id: "pale", name: "pale", style: { color: "#eeeeee" } },
    ],
  } as ReturnType<typeof emptyDesign>;
  const text = (classes: string[], style: Record<string, unknown> = {}) =>
    ({ id: "text0001", type: "text", props: { text: "Hi" }, classes, style }) as LayoutNode;
  const white = (child: LayoutNode) =>
    ({
      id: "box00001",
      type: "container",
      props: {},
      style: { backgroundColor: "#ffffff" },
      children: [child],
    }) as LayoutNode;
  const issues = (child: LayoutNode) =>
    auditPage(page(h("head0001", 1), white(child)), design).issues.map((i) => i.rule);
  // White text on a class's dark background is fine.
  expect(issues(text(["dark"], { color: "#ffffff" }))).toEqual([]);
  // Pale text from a class on white is flagged.
  expect(issues(text(["pale"]))).toEqual(["contrast"]);
  // The element's own colour wins over the class.
  expect(issues(text(["pale"], { color: "#111111" }))).toEqual([]);
});

test("W-638: large text and opacity set by global classes count in the contrast check", () => {
  const design = {
    ...emptyDesign(),
    classes: [
      { id: "big", name: "big", style: { fontSize: { value: 32, unit: "px" } } },
      { id: "faint", name: "faint", style: { opacity: 0.3 } },
    ],
  } as ReturnType<typeof emptyDesign>;
  const text = (classes: string[], color: string) =>
    ({
      id: "text0001",
      type: "text",
      props: { text: "Hi" },
      classes,
      style: { color },
    }) as LayoutNode;
  const report = (child: LayoutNode) =>
    auditPage(
      page(h("head0001", 1), {
        id: "box00001",
        type: "container",
        props: {},
        style: { backgroundColor: "#ffffff" },
        children: [child],
      } as LayoutNode),
      design,
    ).issues;
  // #888 on white is 3.5:1: too low for body text, enough for large text from a class.
  expect(report(text([], "#888888")).map((i) => i.rule)).toEqual(["contrast"]);
  expect(report(text(["big"], "#888888"))).toEqual([]);
  // Near-black text faded to 30% by a class is flagged.
  expect(report(text(["faint"], "#111111")).map((i) => i.rule)).toEqual(["contrast"]);
});

test("W-639: H4 to H6 are not large text, and the site's heading styles count", () => {
  const onWhite = (child: LayoutNode, design = emptyDesign()) =>
    auditPage(
      page(h("head0001", 1), {
        id: "box00001",
        type: "container",
        props: {},
        style: { backgroundColor: "#ffffff" },
        children: [child],
      } as LayoutNode),
      design,
    ).issues.map((i) => `${i.rule}:${i.nodeId}`);
  // #888 on white is 3.5:1: enough for a 24 px H2, too low for a 16 px H4.
  expect(onWhite(h("head0002", 2, { style: { color: "#888888" } }))).toEqual([]);
  expect(
    onWhite(h("head0002", 2), {
      ...emptyDesign(),
      defaults: { h2: { color: "#eeeeee" } },
    } as ReturnType<typeof emptyDesign>),
  ).toEqual(["contrast:head0002"]);
  const h4 = h("head0004", 2, { style: { color: "#888888" } });
  (h4.props as { level: number }).level = 4;
  expect(onWhite(h4)).toContain("contrast:head0004");
});

test("W-772: a ratio just under the bar never reads as meeting it", () => {
  const issue = auditPage(
    page(h("head0001", 1), {
      id: "box00001",
      type: "container",
      props: {},
      style: { backgroundColor: "#ffffff" },
      children: [
        { id: "text0001", type: "text", props: { text: "Hi" }, style: { color: "#777777" } },
      ],
    } as LayoutNode),
    emptyDesign(),
  ).issues.find((i) => i.rule === "contrast");
  // #777 on white is 4.48:1.
  expect(issue?.message).toBe("Text contrast is 4.4:1; it needs 4.5:1.");
});

test("W-773: Fix all leaves no skipped heading level behind", () => {
  const layout = page(h("head0001", 1), h("head0002", 4), h("head0003", 6));
  const fixed = applyAllA11yFixes(layout, auditPage(layout, emptyDesign()).issues);
  expect(rules(fixed)).toEqual([]);
  expect(findNode(fixed, "head0003")?.props).toMatchObject({ level: 3 });
});
