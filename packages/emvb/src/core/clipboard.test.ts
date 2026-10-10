import { describe, expect, test } from "bun:test";
import {
  applyStyle,
  CLIP_REASONS,
  clipStyle,
  droppedNotice,
  elementClip,
  encodeClip,
  pasteNode,
  peekClipKind,
  prepareElement,
  prepareStyle,
  readClip,
  styleClip,
  type Clip,
} from "./clipboard.ts";
import { ELEMENTS } from "./elements/index.ts";
import { emptyDesign, type DesignSystem } from "./schema/design.ts";
import type { Layout, LayoutNode } from "./schema/layout.ts";
import { findNode, nodeChildren } from "./tree-ops.ts";
import { validateLayout } from "./validate.ts";

const page = (children: LayoutNode[]): Layout => ({
  schemaVersion: 14,
  root: { id: "root0001", type: "container", props: {}, children },
});

const design = (): DesignSystem => ({
  ...emptyDesign(),
  variables: {
    colors: [{ id: "brand", name: "Brand", value: "#123456" }],
    fonts: [],
    fontSizes: [],
    spacings: [{ id: "gap-m", name: "Gap M", value: { value: 16, unit: "px" } }],
  },
  classes: [{ id: "card", name: "Card", style: {} }],
});

const heading = (id = "head0001"): LayoutNode => ({
  id,
  type: "heading",
  props: { text: "Hello", level: 2 },
  style: { color: "#ff0000", transition: { duration: 200, easing: "ease", property: "colors" } },
  states: { hover: { color: "#00ff00" } },
  classes: ["card"],
});

const readOk = (raw: string): Clip => {
  const read = readClip(raw);
  if (!read.ok) throw new Error(read.reason);
  return read.clip;
};

const ids = (node: LayoutNode): string[] => [node.id, ...nodeChildren(node).flatMap(ids)];

let seq = 0;
const counter = () => ((seq++ * 7) % 36) / 36;

describe("clipboard envelope (W-093)", () => {
  test("an element round-trips through the envelope, and the copy doesn't share objects", () => {
    const node = heading();
    const clip = elementClip(node);
    expect(clip).toMatchObject({ format: "emvb-clipboard", version: 1, schemaVersion: 14 });
    (node.props as { text: string }).text = "Changed after copy";
    const back = readOk(encodeClip(clip));
    expect(back.kind).toBe("element");
    expect(back.kind === "element" && back.node.props).toEqual({ text: "Hello", level: 2 });
  });

  test("a style clip holds style, states and transition, but not classes or props", () => {
    expect(Object.keys(styleClip(heading())).toSorted()).toEqual([
      "format",
      "kind",
      "schemaVersion",
      "states",
      "style",
      "version",
    ]);
    const clip = readOk(encodeClip(styleClip(heading())));
    expect(clip).toEqual({
      kind: "style",
      style: {
        style: {
          color: "#ff0000",
          transition: { duration: 200, easing: "ease", property: "colors" },
        },
        states: { hover: { color: "#00ff00" } },
      },
    });
  });

  test("an element clip gives its element's local style to Paste style", () => {
    const clip = readOk(encodeClip(elementClip(heading())));
    expect(clipStyle(clip)).toEqual({
      style: {
        color: "#ff0000",
        transition: { duration: 200, easing: "ease", property: "colors" },
      },
      states: { hover: { color: "#00ff00" } },
    });
  });

  test("empty, foreign and broken clipboard text is refused with a reason", () => {
    expect(readClip(null)).toEqual({ ok: false, reason: CLIP_REASONS.empty });
    expect(readClip("")).toEqual({ ok: false, reason: CLIP_REASONS.empty });
    expect(readClip("not json")).toEqual({ ok: false, reason: CLIP_REASONS.unreadable });
    expect(readClip(JSON.stringify({ ...elementClip(heading()), format: "other" }))).toEqual({
      ok: false,
      reason: CLIP_REASONS.unreadable,
    });
    expect(readClip('{"format":"other","version":1}')).toEqual({
      ok: false,
      reason: CLIP_REASONS.unreadable,
    });
    expect(readClip('{"format":"emvb-clipboard","version":"1","schemaVersion":3}')).toEqual({
      ok: false,
      reason: CLIP_REASONS.unreadable,
    });
    expect(readClip(JSON.stringify({ ...elementClip(heading()), kind: "something-else" }))).toEqual(
      { ok: false, reason: CLIP_REASONS.unreadable },
    );
    expect(readClip("x".repeat(600 * 1024))).toEqual({ ok: false, reason: CLIP_REASONS.tooLarge });
  });

  test("a clip from a newer EmVB (envelope or schema) is refused, not guessed at", () => {
    const clip = elementClip(heading());
    expect(readClip(JSON.stringify({ ...clip, version: 2 }))).toEqual({
      ok: false,
      reason: CLIP_REASONS.newer,
    });
    expect(readClip(JSON.stringify({ ...clip, schemaVersion: 15 }))).toEqual({
      ok: false,
      reason: CLIP_REASONS.newer,
    });
  });

  test("a copied node must pass the layout validator, with the issue named", () => {
    const bad = { ...elementClip(heading()), node: { ...heading(), props: { text: 5 } } };
    const read = readClip(JSON.stringify(bad));
    expect(read.ok).toBe(false);
    expect(!read.ok && read.reason).toStartWith("The copied content isn't valid: props.text:");
    const badId = { ...elementClip(heading()), node: { ...heading(), id: "x" } };
    expect(readClip(JSON.stringify(badId)).ok).toBe(false);
    const badState = {
      ...styleClip(heading()),
      states: { hover: { color: "red; background:url(x)" } },
    };
    expect(readClip(JSON.stringify(badState)).ok).toBe(false);
    const transitionInState = {
      ...styleClip(heading()),
      states: { hover: { transition: { duration: 1, easing: "ease", property: "all" } } },
    };
    expect(readClip(JSON.stringify(transitionInState)).ok).toBe(false);
  });

  test("the kind can be peeked without validating, for enabling menu items", () => {
    expect(peekClipKind(null)).toBeNull();
    expect(peekClipKind("{")).toBeNull();
    expect(peekClipKind('{"format":"other","kind":"element"}')).toBeNull();
    expect(peekClipKind(encodeClip(elementClip(heading())))).toBe("element");
    expect(peekClipKind(encodeClip(styleClip(heading())))).toBe("style");
  });
});

describe("preparing a pasted element (W-093)", () => {
  test("every id is new, unique and unused on the target page, like Duplicate", () => {
    const box: LayoutNode = {
      id: "box00001",
      type: "container",
      props: {},
      children: [heading("head0001"), heading("head0002")],
    };
    const layout = page([box]);
    const { node } = prepareElement(box, layout, design(), counter);
    const fresh = ids(node);
    expect(fresh).toHaveLength(3);
    expect(new Set(fresh).size).toBe(3);
    for (const id of fresh) expect(findNode(layout, id)?.id ?? null).toBeNull();
    const pasted = pasteNode(layout, node, "box00001");
    expect(pasted.ok && validateLayout(pasted.layout).ok).toBe(true);
  });

  test("classes the design doesn't have are dropped and counted; known ones stay", () => {
    const node = { ...heading(), classes: ["card", "gone", "also-gone"] };
    const { node: out, dropped } = prepareElement(node, page([]), design());
    expect(out.classes).toEqual(["card"]);
    expect(dropped.classes).toBe(2);
    const { node: none } = prepareElement({ ...node, classes: ["gone"] }, page([]), design());
    expect("classes" in none).toBe(false);
  });

  test("refs to missing variables are dropped in style, states and the shadow colour", () => {
    const node: LayoutNode = {
      id: "head0001",
      type: "heading",
      props: { text: "Hi", level: 2 },
      style: {
        color: { var: "brand" },
        backgroundColor: { var: "missing" },
        paddingTop: { var: "gap-m", from: "spacing" },
        paddingLeft: { var: "brand", from: "spacing" },
        boxShadow: { x: 0, y: 1, blur: 2, spread: 0, color: { var: "nope" } },
      },
      states: { hover: { color: { var: "nope-either" } }, focus: { color: { var: "brand" } } },
    };
    const { node: out, dropped } = prepareElement(node, page([]), design());
    expect(out.style).toEqual({
      color: { var: "brand" },
      paddingTop: { var: "gap-m", from: "spacing" },
      boxShadow: { x: 0, y: 1, blur: 2, spread: 0 },
    });
    expect(out.states).toEqual({ focus: { color: { var: "brand" } } });
    expect(dropped.variables).toBe(4);
  });

  test("checks reach nested children too", () => {
    const box: LayoutNode = {
      id: "box00001",
      type: "container",
      props: {},
      children: [{ ...heading(), classes: ["gone"], style: { color: { var: "gone" } } }],
    };
    const { node, dropped } = prepareElement(box, page([]), design());
    const child = nodeChildren(node)[0];
    expect(child?.classes).toBeUndefined();
    expect(child?.style).toBeUndefined();
    expect(dropped).toEqual({ classes: 1, variables: 1, htmlIds: 0, unsafe: 0 });
  });

  test("a CSS id already used on the page is dropped; a free one is kept", () => {
    const layout = page([{ ...heading("head0009"), htmlId: "hero" }]);
    const taken = prepareElement({ ...heading(), htmlId: "hero" }, layout, design());
    expect(taken.node.htmlId).toBeUndefined();
    expect(taken.dropped.htmlIds).toBe(1);
    const free = prepareElement({ ...heading(), htmlId: "intro" }, layout, design());
    expect(free.node.htmlId).toBe("intro");
    expect(free.dropped.htmlIds).toBe(0);
  });

  test("links, images and SVG the sanitizers refuse fall back to defaults or go", () => {
    const link: LayoutNode = {
      id: "link0001",
      type: "link",
      props: { text: "Go", href: "javascript:alert(1)" },
    };
    const button: LayoutNode = {
      id: "butt0001",
      type: "button",
      props: { text: "Go", href: "javascript:alert(1)" },
    };
    const image: LayoutNode = {
      id: "imag0001",
      type: "image",
      props: { src: "javascript:alert(1)", alt: "" },
    };
    const svg: LayoutNode = {
      id: "svg00001",
      type: "svg",
      props: { markup: "<svg><script>alert(1)</script></svg>" },
    };
    const okLink: LayoutNode = {
      id: "link0002",
      type: "link",
      props: { text: "Go", href: "/pricing" },
    };
    const box: LayoutNode = {
      id: "box00001",
      type: "container",
      props: {},
      children: [link, button, image, svg, okLink],
    };
    const { node, dropped } = prepareElement(box, page([]), design());
    const [l, b, i, s, ok] = nodeChildren(node);
    expect(l?.props).toEqual({ text: "Go", href: "/" });
    expect(b?.props).toEqual({ text: "Go" });
    expect(i?.props).toEqual({ src: ELEMENTS.image.defaults().props.src, alt: "" });
    expect(s?.props).toEqual({ markup: ELEMENTS.svg.defaults().props.markup });
    expect(ok?.props).toEqual({ text: "Go", href: "/pricing" });
    expect(dropped.unsafe).toBe(4);
  });

  test("a style paste drops missing variables too", () => {
    const { style, dropped } = prepareStyle(
      { style: { color: { var: "gone" }, backgroundColor: { var: "brand" } } },
      design(),
    );
    expect(style).toEqual({ style: { backgroundColor: { var: "brand" } } });
    expect(dropped.variables).toBe(1);
  });

  test("a style paste drops a missing variable in the icon shadow's colour, keeping the shadow (W-245)", () => {
    const { style, dropped } = prepareStyle(
      {
        style: { iconShadow: { x: 0, y: 2, blur: 4, color: { var: "gone" } } },
        states: { hover: { iconShadow: { x: 1, y: 1, blur: 2, color: { var: "brand" } } } },
      },
      design(),
    );
    expect(style).toEqual({
      style: { iconShadow: { x: 0, y: 2, blur: 4 } },
      states: { hover: { iconShadow: { x: 1, y: 1, blur: 2, color: { var: "brand" } } } },
    });
    expect(dropped.variables).toBe(1);
  });

  test("the notice lists what was left out, or is null", () => {
    expect(droppedNotice({ classes: 0, variables: 0, htmlIds: 0, unsafe: 0 })).toBeNull();
    expect(droppedNotice({ classes: 2, variables: 1, htmlIds: 0, unsafe: 0 })).toBe(
      "Left out 2 classes and 1 variable. Classes and variables this site doesn't have were removed.",
    );
    expect(droppedNotice({ classes: 0, variables: 0, htmlIds: 1, unsafe: 2 })).toBe(
      "Left out 1 CSS id already used on this page and 2 links, images or SVGs that aren't allowed.",
    );
  });
});

describe("where a paste goes (W-093)", () => {
  const form: LayoutNode = {
    id: "form0001",
    type: "form",
    props: { formId: "f" },
    children: [{ id: "inpt0001", type: "text-input", props: { field: "email" } }],
  };
  const tabs: LayoutNode = {
    id: "tabs0001",
    type: "tabs",
    props: {},
    children: [{ id: "panl0001", type: "tab-panel", props: { label: "One" }, children: [] }],
  };
  const layout = page([heading("head0001"), form, tabs, heading("head0002")]);
  const kids = (result: ReturnType<typeof pasteNode>, parent: string) =>
    result.ok ? nodeChildren(findNode(result.layout, parent) as LayoutNode).map((n) => n.id) : [];

  test("after the selected element, selected", () => {
    const pasted = pasteNode(layout, heading("new00001"), "head0001");
    expect(kids(pasted, "root0001")).toEqual([
      "head0001",
      "new00001",
      "form0001",
      "tabs0001",
      "head0002",
    ]);
    expect(pasted.ok && pasted.selected).toBe("new00001");
  });

  test("at the end of the page with nothing selected or the outer container selected", () => {
    for (const selected of [null, "root0001", "gone0001"]) {
      expect(kids(pasteNode(layout, heading("new00001"), selected), "root0001").at(-1)).toBe(
        "new00001",
      );
    }
  });

  test("inside when after is refused: a field on a form, a panel on Tabs", () => {
    const field: LayoutNode = { id: "inpt0002", type: "text-input", props: { field: "name" } };
    expect(kids(pasteNode(layout, field, "form0001"), "form0001")).toEqual([
      "inpt0001",
      "inpt0002",
    ]);
    const panel: LayoutNode = {
      id: "panl0002",
      type: "tab-panel",
      props: { label: "Two" },
      children: [],
    };
    expect(kids(pasteNode(layout, panel, "tabs0001"), "tabs0001")).toEqual([
      "panl0001",
      "panl0002",
    ]);
    expect(kids(pasteNode(layout, panel, "panl0001"), "tabs0001")).toEqual([
      "panl0001",
      "panl0002",
    ]);
  });

  test("a paste the drop rules refuse returns the after-reason and changes nothing", () => {
    const field: LayoutNode = { id: "inpt0002", type: "text-input", props: { field: "name" } };
    expect(pasteNode(layout, field, "head0001")).toEqual({
      ok: false,
      reason: "Form fields must be placed inside a form.",
    });
    const panel: LayoutNode = {
      id: "panl0002",
      type: "tab-panel",
      props: { label: "Two" },
      children: [],
    };
    expect(pasteNode(layout, panel, "head0002")).toEqual({
      ok: false,
      reason: "Tab panels can only go inside Tabs.",
    });
    expect(pasteNode(layout, { ...form, id: "form0002" }, "inpt0001")).toEqual({
      ok: false,
      reason: "A form can't go inside another form.",
    });
  });

  test("Paste inside goes to the end of the selected parent, and refuses a leaf", () => {
    const box: LayoutNode = {
      id: "box00001",
      type: "container",
      props: {},
      children: [heading("head0003")],
    };
    const withBox = page([box]);
    expect(kids(pasteNode(withBox, heading("new00001"), "box00001", "inside"), "box00001")).toEqual(
      ["head0003", "new00001"],
    );
    expect(pasteNode(withBox, heading("new00001"), "head0003", "inside")).toEqual({
      ok: false,
      reason: "Only layout containers, forms, and loops can hold other elements.",
    });
  });
});

describe("pasting a style (W-093)", () => {
  test("replaces local style and states, keeping props, classes and children", () => {
    const target: LayoutNode = {
      id: "box00001",
      type: "container",
      props: { tag: "section" },
      classes: ["card"],
      style: { backgroundColor: "#000000" },
      states: { active: { color: "#111111" } },
      children: [heading()],
    };
    const out = applyStyle(target, { style: { color: "#ff0000" }, states: { hover: {} } });
    expect(out).toEqual({
      id: "box00001",
      type: "container",
      props: { tag: "section" },
      classes: ["card"],
      style: { color: "#ff0000" },
      states: { hover: {} },
      children: [heading()],
    });
    const cleared = applyStyle(target, {});
    expect("style" in cleared || "states" in cleared).toBe(false);
  });
});

describe("pasting an Icon's style elsewhere (W-292)", () => {
  const iconStyle = {
    style: { color: "#ff0000", iconRotate: 45, iconShadow: { x: 0, y: 2, blur: 4 } },
    states: { hover: { iconScale: 1.2 }, focus: { color: "#00ff00", iconFlip: "both" as const } },
    devices: { mobile: { iconAnimation: { type: "spin" as const, duration: 1000 } } },
  };

  test("a Heading gets the colour but not the Icon glyph keys", () => {
    const out = applyStyle(heading("head0009"), iconStyle);
    expect(out.style).toEqual({ color: "#ff0000" });
    expect(out.states).toEqual({ focus: { color: "#00ff00" } });
    expect("devices" in out).toBe(false);
  });

  test("an Icon keeps every key", () => {
    const icon = { id: "icon0009", type: "icon", props: { iconId: "lucide:star" } } as LayoutNode;
    const out = applyStyle(icon, iconStyle);
    expect(out.style).toEqual(iconStyle.style);
    expect(out.states).toEqual(iconStyle.states);
    expect(out.devices).toEqual(iconStyle.devices);
  });

  test("a style with only glyph keys leaves a Heading with no local style", () => {
    const out = applyStyle(heading("head0010"), { style: { iconRotate: 90 } });
    expect("style" in out).toBe(false);
  });
});
