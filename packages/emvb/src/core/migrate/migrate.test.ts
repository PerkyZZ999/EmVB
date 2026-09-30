import { describe, expect, test } from "bun:test";
import { randomLayouts, s1Page } from "../../../test/fixtures/layouts.ts";
import { validateLayout } from "../validate.ts";
import { DESIGN_SCHEMA_VERSION } from "../schema/design.ts";
import { LAYOUT_SCHEMA_VERSION } from "../schema/layout.ts";
import { validateDesign } from "../validate.ts";
import {
  DESIGN_MIGRATIONS,
  isNewerThanSupported,
  LAYOUT_MIGRATIONS,
  upgradeLayout,
  type Migration,
} from "./index.ts";

// A hypothetical v0 format: `{ version: 0, tree }` with headings storing `size` instead of `level`.
const v0 = {
  schemaVersion: 0,
  tree: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "head0001", type: "heading", props: { text: "Hi", size: 2 } }],
  },
};
const renameLevel = (node: Record<string, unknown>): Record<string, unknown> => {
  const props = node["props"] as Record<string, unknown>;
  const { size, ...rest } = props;
  const children = node["children"] as Record<string, unknown>[] | undefined;
  return {
    ...node,
    props: node["type"] === "heading" ? { ...rest, level: size } : props,
    ...(children ? { children: children.map(renameLevel) } : {}),
  };
};
const migrations: Record<number, Migration> = {
  ...LAYOUT_MIGRATIONS,
  0: (doc) => ({ root: renameLevel(doc["tree"] as Record<string, unknown>) }),
};

describe("upgradeLayout", () => {
  test("runs the chain from v0 to the current version and the result validates", () => {
    const result = upgradeLayout(v0, migrations);
    expect(result).toEqual({
      ok: true,
      from: 0,
      doc: {
        schemaVersion: 2,
        root: {
          id: "root0001",
          type: "container",
          props: {},
          children: [{ id: "head0001", type: "heading", props: { text: "Hi", level: 2 } }],
        },
      },
    });
    expect(validateLayout(v0, migrations)).toMatchObject({ ok: true, upgradedFrom: 0 });
  });

  test("is idempotent and does not mutate its input", () => {
    const snapshot = structuredClone(v0);
    const once = upgradeLayout(v0, migrations);
    if (!once.ok) throw new Error("upgrade failed");
    expect(upgradeLayout(once.doc, migrations)).toEqual({ ok: true, doc: once.doc, from: 2 });
    expect(v0).toEqual(snapshot);
  });

  test("a current document is returned unchanged", () => {
    expect(upgradeLayout(s1Page())).toEqual({ ok: true, doc: s1Page(), from: 2 });
  });

  test("a missing step is reported instead of skipped", () => {
    expect(upgradeLayout(v0, {})).toEqual({ ok: false, reason: "no-migration", version: 0 });
  });

  test("newer documents are refused, and detected for read-only mode", () => {
    expect(upgradeLayout({ schemaVersion: 9 })).toEqual({
      ok: false,
      reason: "newer-version",
      version: 9,
    });
    expect(isNewerThanSupported({ schemaVersion: 9 })).toBe(true);
    expect(isNewerThanSupported(s1Page())).toBe(false);
    expect(isNewerThanSupported("junk")).toBe(false);
  });

  test("property: upgrading any valid layout is a no-op, and repeat upgrades agree", () => {
    const layouts = randomLayouts(200);
    for (const layout of layouts) {
      const first = upgradeLayout(layout, migrations);
      expect(first).toEqual({ ok: true, doc: layout, from: 2 });
      if (!first.ok) continue;
      expect(upgradeLayout(first.doc, migrations)).toEqual(first);
      expect(validateLayout(layout, migrations)).toEqual({ ok: true, layout, upgradedFrom: 2 });
    }
  });
});

describe("schema v2 (D-031)", () => {
  const asV1 = <T extends object>(doc: T) => ({ ...doc, schemaVersion: 1 });

  test("layout and design are at version 2", () => {
    expect(LAYOUT_SCHEMA_VERSION).toBe(2);
    expect(DESIGN_SCHEMA_VERSION).toBe(2);
  });

  test("a v1 layout upgrades to v2 with every value kept", () => {
    for (const layout of randomLayouts(50, 7)) {
      expect(upgradeLayout(asV1(layout))).toEqual({ ok: true, doc: layout, from: 1 });
      expect(validateLayout(asV1(layout))).toEqual({ ok: true, layout, upgradedFrom: 1 });
    }
  });

  test("a v1 design document upgrades to v2 with its variables and classes kept", () => {
    const design = {
      schemaVersion: 2,
      variables: { colors: [{ id: "ink", name: "Ink", value: "#112233" }] },
      classes: [{ id: "card", name: "Card", style: { opacity: 0.5, zIndex: 2 } }],
    };
    expect(upgradeLayout(asV1(design), DESIGN_MIGRATIONS, DESIGN_SCHEMA_VERSION)).toEqual({
      ok: true,
      doc: design,
      from: 1,
    });
    expect<unknown>(validateDesign(asV1(design))).toEqual({ ok: true, design, upgradedFrom: 1 });
  });

  test("a v1 EmVB meets a v2 page as newer, not as invalid", () => {
    const page = s1Page();
    expect(upgradeLayout(page, {}, 1)).toEqual({ ok: false, reason: "newer-version", version: 2 });
    expect(validateLayout({ ...page, schemaVersion: 3 })).toMatchObject({
      ok: false,
      issues: [{ path: "schemaVersion", code: "newer-version" }],
    });
  });

  test("the v1 step changes nothing and does not mutate its input", () => {
    const doc = asV1(s1Page());
    const snapshot = structuredClone(doc);
    const step = LAYOUT_MIGRATIONS[1];
    expect(step?.(doc)).toEqual(doc);
    expect(DESIGN_MIGRATIONS[1]?.(doc)).toEqual(doc);
    expect(doc).toEqual(snapshot);
  });
});
