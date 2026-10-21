import { describe, expect, test } from "bun:test";
import {
  classMergeNotice,
  insertSavedSection,
  mergeSectionClasses,
  readSavedSection,
  SAVED_SECTION_REASONS,
  savedSectionName,
  snapshotSection,
  syncedPartLayout,
  type SavedSection,
} from "./saved-sections.ts";
import { wrapInThemeSection } from "./arrange.ts";
import { emptyDesign, type DesignSystem } from "./schema/design.ts";
import type { Layout, LayoutNode } from "./schema/layout.ts";
import { findNode, nodeChildren } from "./tree-ops.ts";
import { validateDesign, validateLayout } from "./validate.ts";

const NOW = "2026-10-21T21:00:00.000Z";

const page = (children: LayoutNode[]): Layout => ({
  schemaVersion: 17,
  root: { id: "root0001", type: "container", props: {}, children },
});

const site = (classes: DesignSystem["classes"]): DesignSystem => ({
  ...emptyDesign(),
  variables: {
    colors: [{ id: "brand", name: "Brand", value: "#123456" }],
    fonts: [],
    fontSizes: [],
    spacings: [],
  },
  classes,
});

const red = { id: "card", name: "Card", style: { color: "#ff0000" } };
const blue = { id: "card", name: "Card", style: { color: "#0000ff" } };

const hero = (): LayoutNode => ({
  id: "box00001",
  type: "div-block",
  props: {},
  htmlId: "hero",
  classes: ["card"],
  children: [
    { id: "head0001", type: "heading", props: { text: "Hi", level: 2 }, classes: ["card"] },
  ],
});

const saved = (design = site([red])): SavedSection => {
  const snap = snapshotSection(page([hero()]), "box00001", design, "  Hero  ", NOW);
  if (!snap.ok) throw new Error(snap.reason);
  const read = readSavedSection(JSON.parse(JSON.stringify(snap.record)));
  if (!read.ok) throw new Error(read.reason);
  return read.section;
};

let seq = 0;
const counter = () => ((seq++ * 7) % 36) / 36;
const ids = (node: LayoutNode): string[] => [node.id, ...nodeChildren(node).flatMap(ids)];

describe("saved sections: save and read (W-874)", () => {
  test("a snapshot keeps the element, its children and only the classes it uses", () => {
    const design = site([red, { id: "other", name: "Other", style: {} }]);
    const snap = snapshotSection(page([hero()]), "box00001", design, "Hero", NOW);
    expect(snap.ok).toBe(true);
    if (!snap.ok) return;
    expect(snap.record.name).toBe("Hero");
    expect(snap.record.classes.map((c) => c.id)).toEqual(["card"]);
    expect(snap.record.layout.root.children[0]?.id).toBe("box00001");
  });

  test("blank names, the page itself and missing elements are refused", () => {
    const layout = page([hero()]);
    const design = site([red]);
    expect(snapshotSection(layout, "box00001", design, "  ", NOW)).toEqual({
      ok: false,
      reason: SAVED_SECTION_REASONS.name,
    });
    expect(snapshotSection(layout, "root0001", design, "Page", NOW)).toEqual({
      ok: false,
      reason: SAVED_SECTION_REASONS.root,
    });
    expect(snapshotSection(layout, "nope0001", design, "X", NOW).ok).toBe(false);
  });

  test("A/B test arms are not saved with the copy", () => {
    const node = { ...hero(), variant: { test: "t1", arm: "a" } } as LayoutNode;
    const snap = snapshotSection(page([node]), "box00001", site([red]), "Hero", NOW);
    expect(snap.ok).toBe(true);
    expect(snap.ok && "variant" in (snap.record.layout.root.children[0] ?? {})).toBe(false);
  });

  test("names are cleaned and clipped to 60 characters", () => {
    expect(savedSectionName("  Hero\u200b  ")).toBe("Hero");
    expect(savedSectionName("x".repeat(200))).toHaveLength(60);
  });

  test("a save from an older layout schema is upgraded when read", () => {
    const snap = snapshotSection(page([hero()]), "box00001", site([red]), "Hero", NOW);
    if (!snap.ok) throw new Error(snap.reason);
    const read = readSavedSection({
      ...snap.record,
      layout: { ...snap.record.layout, schemaVersion: 15 },
    });
    expect(read.ok).toBe(true);
    if (read.ok) expect(validateLayout(page([read.section.node])).ok).toBe(true);
  });

  test("damaged or hand-edited records are refused, never half-used", () => {
    const damaged = { ok: false, reason: SAVED_SECTION_REASONS.damaged } as const;
    expect(readSavedSection(null)).toEqual(damaged);
    expect(readSavedSection({ version: 2 })).toEqual(damaged);
    const snap = snapshotSection(page([hero()]), "box00001", site([red]), "Hero", NOW);
    if (!snap.ok) throw new Error(snap.reason);
    expect(readSavedSection({ ...snap.record, name: "" })).toEqual(damaged);
    expect(readSavedSection({ ...snap.record, classes: [{ id: "BAD ID" }] })).toEqual(damaged);
    const bad = structuredClone(snap.record) as unknown as { layout: { root: { type: string } } };
    bad.layout.root.type = "script";
    expect(readSavedSection(bad)).toEqual(damaged);
  });
});

describe("saved sections: classes on insert (W-874, D-060)", () => {
  test("a class the site doesn't have is recreated", () => {
    const merge = mergeSectionClasses(site([]), [red]);
    if ("ok" in merge) throw new Error(merge.reason);
    expect(merge.design.classes).toEqual([red]);
    expect(merge.added).toEqual(["Card"]);
  });

  test("the same class with the same look is reused, not duplicated", () => {
    const merge = mergeSectionClasses(site([red]), [red]);
    if ("ok" in merge) throw new Error(merge.reason);
    expect(merge.design.classes).toHaveLength(1);
    expect(merge.reused).toEqual(["Card"]);
    expect(merge.ids.get("card")).toBe("card");
  });

  test("a clash with a different look never overwrites: the copy gets a numbered name and new id", () => {
    const merge = mergeSectionClasses(site([blue]), [red]);
    if ("ok" in merge) throw new Error(merge.reason);
    expect(merge.design.classes?.[0]).toEqual(blue);
    const copy = merge.design.classes?.[1];
    expect(copy?.name).toBe("Card 2");
    expect(copy?.id).not.toBe("card");
    expect(copy?.style).toEqual(red.style);
    expect(merge.ids.get("card")).toBe(copy?.id);
    expect(classMergeNotice(merge)).toBe("Classes: 1 added as a copy (Card → Card 2).");
    expect(validateDesign(merge.design).ok).toBe(true);
  });

  test("a same-named class under another id with the same look is reused", () => {
    const merge = mergeSectionClasses(site([{ ...red, id: "card-x" }]), [red]);
    if ("ok" in merge) throw new Error(merge.reason);
    expect(merge.ids.get("card")).toBe("card-x");
    expect(merge.design.classes).toHaveLength(1);
  });

  test("refs to variables the site doesn't have are dropped from incoming classes", () => {
    const cls = { id: "tone", name: "Tone", style: { color: { var: "missing" } } };
    const merge = mergeSectionClasses(site([]), [cls as never]);
    if ("ok" in merge) throw new Error(merge.reason);
    expect(merge.design.classes?.[0]?.style).toEqual({});
  });

  test("going over the class limit is refused", () => {
    const full = Array.from({ length: 100 }, (_, n) => ({ id: `c${n}`, name: `C${n}`, style: {} }));
    expect(mergeSectionClasses(site(full), [red])).toEqual({
      ok: false,
      reason: SAVED_SECTION_REASONS.tooManyClasses,
    });
  });

  test("insert gives fresh ids, remaps classes, drops a clashing CSS id and validates", () => {
    const section = saved();
    const layout = page([hero()]);
    const out = insertSavedSection(section, layout, site([blue]), "box00001", counter);
    if (!out.ok) throw new Error(out.reason);
    const inserted = findNode(out.layout, out.selected);
    expect(inserted).toBeDefined();
    if (!inserted) return;
    expect(ids(inserted).some((id) => ids(layout.root).includes(id))).toBe(false);
    const copyId = out.design.classes?.[1]?.id;
    expect(inserted.classes).toEqual([copyId ?? ""]);
    expect(inserted.htmlId).toBeUndefined();
    expect(out.dropped.htmlIds).toBe(1);
    expect(validateLayout(out.layout).ok).toBe(true);
    expect(validateDesign(out.design).ok).toBe(true);
  });
});

describe("synced sections (W-876, W-098)", () => {
  test("the part layout is a fresh-id copy; the page keeps the element inside a Theme section", () => {
    const layout = page([hero()]);
    const part = syncedPartLayout(layout, "box00001", counter);
    expect(part && validateLayout(part).ok).toBe(true);
    const copy = part?.root.children[0];
    expect(copy?.type).toBe("div-block");
    expect(ids(copy as LayoutNode).some((id) => ids(layout.root).includes(id))).toBe(false);
    expect(syncedPartLayout(layout, "root0001")).toBeNull();
    const linked = wrapInThemeSection(layout, "box00001", "PART01", counter);
    if (!linked.ok) throw new Error(linked.reason);
    const shell = findNode(linked.layout, linked.selected);
    expect(shell?.type).toBe("section");
    expect(shell?.props).toEqual({ partId: "PART01" });
    expect(nodeChildren(shell as LayoutNode).map((n) => n.id)).toEqual(["box00001"]);
    expect(validateLayout(linked.layout).ok).toBe(true);
    expect(wrapInThemeSection(layout, "root0001", "PART01").ok).toBe(false);
  });
});
