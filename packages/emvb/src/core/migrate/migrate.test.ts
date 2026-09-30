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
        schemaVersion: 3,
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
    expect(upgradeLayout(once.doc, migrations)).toEqual({ ok: true, doc: once.doc, from: 3 });
    expect(v0).toEqual(snapshot);
  });

  test("a current document is returned unchanged", () => {
    expect(upgradeLayout(s1Page())).toEqual({ ok: true, doc: s1Page(), from: 3 });
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
      expect(first).toEqual({ ok: true, doc: layout, from: 3 });
      if (!first.ok) continue;
      expect(upgradeLayout(first.doc, migrations)).toEqual(first);
      expect(validateLayout(layout, migrations)).toEqual({ ok: true, layout, upgradedFrom: 3 });
    }
  });
});

describe("schema versions (D-031, D-032)", () => {
  const asV =
    (version: number) =>
    <T extends object>(doc: T) => ({ ...doc, schemaVersion: version });

  test("layout and design are at version 3", () => {
    expect(LAYOUT_SCHEMA_VERSION).toBe(3);
    expect(DESIGN_SCHEMA_VERSION).toBe(3);
  });

  test.each([1, 2])("a v%i layout upgrades to v3 with every value kept", (version) => {
    for (const layout of randomLayouts(50, 7)) {
      const older = asV(version)(layout);
      expect(upgradeLayout(older)).toEqual({ ok: true, doc: layout, from: version });
      expect(validateLayout(older)).toEqual({ ok: true, layout, upgradedFrom: version });
    }
  });

  test.each([1, 2])(
    "a v%i design document upgrades to v3 with its variables and classes kept",
    (version) => {
      const design = {
        schemaVersion: 3,
        variables: { colors: [{ id: "ink", name: "Ink", value: "#112233" }] },
        classes: [{ id: "card", name: "Card", style: { opacity: 0.5, zIndex: 2 } }],
      };
      const older = asV(version)(design);
      expect(upgradeLayout(older, DESIGN_MIGRATIONS, DESIGN_SCHEMA_VERSION)).toEqual({
        ok: true,
        doc: design,
        from: version,
      });
      expect<unknown>(validateDesign(older)).toEqual({ ok: true, design, upgradedFrom: version });
    },
  );

  test("an older EmVB meets a v3 page as newer, not as invalid", () => {
    const page = s1Page();
    expect(upgradeLayout(page, {}, 2)).toEqual({ ok: false, reason: "newer-version", version: 3 });
    expect(validateLayout({ ...page, schemaVersion: 4 })).toMatchObject({
      ok: false,
      issues: [{ path: "schemaVersion", code: "newer-version" }],
    });
  });

  test.each([1, 2])("the v%i step changes nothing and does not mutate its input", (version) => {
    const doc = asV(version)(s1Page());
    const snapshot = structuredClone(doc);
    expect(LAYOUT_MIGRATIONS[version]?.(doc)).toEqual(doc);
    expect(DESIGN_MIGRATIONS[version]?.(doc)).toEqual(doc);
    expect(doc).toEqual(snapshot);
  });
});
