import { describe, expect, test } from "bun:test";
import { MAX_UNKNOWN_DEPTH, MAX_UNKNOWN_KEYS } from "./limits.ts";
import { patchNestedStyle, upgradeLegacyNode } from "./migrate/v18.ts";
import { renderPage } from "./render/index.ts";
import { emptyDesign } from "./schema/design.ts";
import { CONTRACT_VERSION, LAYOUT_SCHEMA_VERSION } from "./schema/layout.ts";
import type { Layout, LayoutNode } from "./schema/layout.ts";
import { validateDesign, validateLayout } from "./validate.ts";

// W-925: the frozen schema contract 1.0 (D-065 unknown keys; renames and motion folding in v18).

const fade = { type: "fade", duration: 400 };
const ease = { duration: 200, easing: "ease-out", property: "colors" };

const page = (children: unknown[], schemaVersion = LAYOUT_SCHEMA_VERSION) => ({
  schemaVersion,
  root: { id: "root0001", type: "container", props: {}, children },
});
const heading = (extra: Record<string, unknown> = {}) => ({
  id: "head0001",
  type: "heading",
  props: { text: "Hi", level: 1 },
  ...extra,
});
const ok = (input: unknown): Layout => {
  const result = validateLayout(input);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.layout;
};
const issuesOf = (input: unknown) => {
  const result = validateLayout(input);
  return result.ok ? [] : result.issues;
};
const rendered = (layout: Layout) => {
  const { html, css } = renderPage(layout, emptyDesign());
  return html + "\n" + css;
};

describe("contract version (W-925)", () => {
  test("the contract is 1.0 on layout schema 18", () => {
    expect(CONTRACT_VERSION).toBe("1.0");
    expect(LAYOUT_SCHEMA_VERSION).toBe(18);
  });
});

describe("v17 → v18 migration (W-925)", () => {
  test("a v17 page gets the 1.0 names and its motion under style.motion", () => {
    const v17 = page(
      [
        { id: "sect0001", type: "section", props: { partId: "PART01" }, children: [] },
        { id: "loop0001", type: "loop", props: { itemPartId: "ITEM01" }, children: [] },
        heading({
          label: "Hero title",
          style: { color: "#112233", entrance: fade, transition: ease },
          devices: { mobile: { entrance: { type: "scale", duration: 300 } } },
        }),
      ],
      17,
    );
    const layout = ok(v17);
    const [part, loop, head] = layout.root.children as LayoutNode[];
    expect(part?.type).toBe("part-ref");
    expect(part?.props).toEqual({ partId: "PART01" });
    expect(loop?.props).toEqual({ partId: "ITEM01" });
    expect(head).toMatchObject({
      editorLabel: "Hero title",
      style: { color: "#112233", motion: { entrance: fade, transition: ease } },
      devices: { mobile: { motion: { entrance: { type: "scale", duration: 300 } } } },
    });
    expect("label" in (head as object)).toBe(false);
    expect("entrance" in ((head as { style: object }).style ?? {})).toBe(false);
  });

  test("a v16 design gets class motion under style.motion", () => {
    const result = validateDesign({
      ...emptyDesign(),
      schemaVersion: 16,
      classes: [
        { id: "card", name: "Card", style: { opacity: 0.5, scrollMotion: { type: "none" } } },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.design.schemaVersion).toBe(17);
      expect(result.design.classes?.[0]?.style).toEqual({
        opacity: 0.5,
        motion: { scroll: { type: "none" } },
      });
    }
  });

  test("the v17 and v18 forms of a page render byte-identical HTML and CSS", () => {
    const v17 = ok(
      page(
        [heading({ label: "x", style: { color: "#112233", entrance: fade, transition: ease } })],
        17,
      ),
    );
    const v18 = ok(
      page([
        heading({
          editorLabel: "x",
          style: { color: "#112233", motion: { entrance: fade, transition: ease } },
        }),
      ]),
    );
    expect(v17).toEqual(v18);
    expect(rendered(v18)).toBe(rendered(v17));
    expect(rendered(v18)).toContain("animation:emvb-fade 400ms");
  });

  test("upgrading an already-current node changes nothing", () => {
    const node = heading({ editorLabel: "x", style: { motion: { entrance: fade } } });
    expect(upgradeLegacyNode(node)).toEqual(node);
  });
});

describe("unknown keys (D-065)", () => {
  const LEAK = "zzLeakValue";

  test("unknown keys on a node, its props and its style records are kept untouched", () => {
    const layout = ok(
      page([
        heading({
          futureNode: { nested: [LEAK] },
          props: { text: "Hi", level: 1, futureProp: LEAK },
          style: { color: "#112233", futureStyle: LEAK },
          states: { hover: { futureHover: LEAK } },
          devices: { mobile: { futureMobile: LEAK } },
        }),
      ]),
    );
    const head = layout.root.children?.[0] as unknown as Record<string, Record<string, unknown>>;
    expect(head["futureNode"]).toEqual({ nested: [LEAK] });
    expect(head["props"]?.["futureProp"]).toBe(LEAK);
    expect(head["style"]?.["futureStyle"]).toBe(LEAK);
    expect(head["states"]).toEqual({ hover: { futureHover: LEAK } });
    expect(head["devices"]).toEqual({ mobile: { futureMobile: LEAK } });
  });

  test("an unknown key never reaches the HTML or CSS", () => {
    const layout = ok(
      page([
        heading({
          futureNode: LEAK,
          props: { text: "Hi", level: 1, futureProp: LEAK },
          style: { color: "#112233", futureStyle: LEAK },
          states: { hover: { futureHover: LEAK } },
          devices: { mobile: { futureMobile: LEAK } },
        }),
      ]),
    );
    const out = rendered(layout);
    expect(out).not.toContain(LEAK);
    expect(out).not.toContain("future");
    expect(out).toContain("color:#112233");
  });

  test("a 0.x flat motion key on a v18 style is kept but not rendered", () => {
    const layout = ok(page([heading({ style: { color: "#112233", entrance: fade } })]));
    expect(
      (layout.root.children?.[0]?.style as Record<string, unknown> | undefined)?.["entrance"],
    ).toEqual(fade);
    expect(rendered(layout)).not.toContain("emvb-fade");
  });

  test("a v18 design keeps unknown keys on class styles and never renders them", () => {
    const result = validateDesign({
      ...emptyDesign(),
      classes: [{ id: "card", name: "Card", style: { opacity: 0.5, futureClass: LEAK } }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      (result.design.classes?.[0]?.style as Record<string, unknown> | undefined)?.["futureClass"],
    ).toBe(LEAK);
    const { css } = renderPage(ok(page([heading({ classes: ["card"] })])), result.design);
    expect(css).not.toContain(LEAK);
    expect(css).toContain("opacity:0.5");
  });

  test("a bad key name is refused with unknown_key", () => {
    const issues = issuesOf(page([heading({ style: { "on click<": 1 } })]));
    expect(issues).toEqual([
      expect.objectContaining({ path: "root.children[0].style.on click<", code: "unknown_key" }),
    ]);
  });

  test(`at most ${MAX_UNKNOWN_KEYS} unknown keys are kept in one place`, () => {
    const keys = (n: number) =>
      Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, i]));
    expect(issuesOf(page([heading(keys(MAX_UNKNOWN_KEYS))]))).toEqual([]);
    const issues = issuesOf(page([heading(keys(MAX_UNKNOWN_KEYS + 1))]));
    expect(issues).toEqual([
      expect.objectContaining({
        code: "unknown_key",
        path: `root.children[0].k${MAX_UNKNOWN_KEYS}`,
      }),
    ]);
  });

  test(`an unknown key nests at most ${MAX_UNKNOWN_DEPTH} levels`, () => {
    const deep = (n: number): unknown => (n === 1 ? { leaf: 1 } : { next: deep(n - 1) });
    expect(issuesOf(page([heading({ future: deep(MAX_UNKNOWN_DEPTH) })]))).toEqual([]);
    const issues = issuesOf(page([heading({ future: deep(MAX_UNKNOWN_DEPTH + 1) })]));
    expect(issues).toEqual([
      expect.objectContaining({ code: "unknown_key", path: "root.children[0].future" }),
    ]);
  });

  test("everywhere else stays strict", () => {
    expect(validateLayout({ ...page([]), future: 1 }).ok).toBe(false);
    expect(validateDesign({ ...emptyDesign(), future: 1 }).ok).toBe(false);
    expect(
      issuesOf(page([heading({ states: { hover: { motion: { transition: ease } } } })])).length,
    ).toBeGreaterThan(0);
  });
});

describe("patchNestedStyle (W-925)", () => {
  test("flat motion keys land in style.motion part by part; undefined clears", () => {
    const stored = { color: "#112233", future: 1, motion: { entrance: fade, transition: ease } };
    expect(
      patchNestedStyle(stored, { transition: undefined, scrollMotion: { type: "none" } }),
    ).toEqual({
      color: "#112233",
      future: 1,
      motion: { entrance: fade, scroll: { type: "none" } },
    });
    expect(
      patchNestedStyle(stored, { entrance: undefined, transition: undefined, color: undefined }),
    ).toEqual({
      future: 1,
    });
  });
});
