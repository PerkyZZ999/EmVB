import { describe, expect, test } from "bun:test";
import { randomLayouts, s1Page } from "../../../test/fixtures/layouts.ts";
import { validateLayout } from "../validate.ts";
import { isNewerThanSupported, upgradeLayout, type Migration } from "./index.ts";

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
  0: (doc) => ({ root: renameLevel(doc["tree"] as Record<string, unknown>) }),
};

describe("upgradeLayout", () => {
  test("runs the chain from v0 to the current version and the result validates", () => {
    const result = upgradeLayout(v0, migrations);
    expect(result).toEqual({
      ok: true,
      from: 0,
      doc: {
        schemaVersion: 1,
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
    expect(upgradeLayout(once.doc, migrations)).toEqual({ ok: true, doc: once.doc, from: 1 });
    expect(v0).toEqual(snapshot);
  });

  test("a current document is returned unchanged", () => {
    expect(upgradeLayout(s1Page())).toEqual({ ok: true, doc: s1Page(), from: 1 });
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
      expect(first).toEqual({ ok: true, doc: layout, from: 1 });
      if (!first.ok) continue;
      expect(upgradeLayout(first.doc, migrations)).toEqual(first);
      expect(validateLayout(layout, migrations)).toEqual({ ok: true, layout, upgradedFrom: 1 });
    }
  });
});
