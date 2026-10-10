import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  DESIGN_SCHEMA_VERSION,
  LAYOUT_SCHEMA_VERSION,
  validateDesign,
  validateLayout,
} from "../../packages/emvb/src/core/index.ts";

// docs/system/layout-format.md fell behind the code because nothing checked it. This runs its JSON
// examples through the real validators. A page or design example must also be at the current
// schema (`upgradedFrom`): an older one would otherwise still pass after a silent upgrade.
const doc = readFileSync(new URL("../../docs/system/layout-format.md", import.meta.url), "utf8");

type Validation = { ok: true; upgradedFrom: number } | { ok: false; issues: unknown[] };
/** On failure this shows the issues, or the version the example was written at. */
const outcome = (result: Validation) =>
  result.ok ? { upgradedFrom: result.upgradedFrom } : { issues: result.issues };

const kind = (example: Record<string, unknown>) =>
  "root" in example
    ? "layout"
    : "variables" in example
      ? "design"
      : "type" in example
        ? "node"
        : "unclassified";

describe("the layout format doc", () => {
  test("its examples and stated schema version match the code", () => {
    const fences = /^(`{3,}|~{3,})json[ \t]*\r?\n([\s\S]*?)^\1[ \t]*\r?$/gm;
    const examples = [...doc.matchAll(fences)].map(
      (match) => JSON.parse(match[2] ?? "") as Record<string, unknown>,
    );
    // An indented or unclosed fence would be skipped above, so count the openings loosely too.
    expect(doc.match(/^[ \t]*(`{3,}|~{3,})[ \t]*json\b/gim)?.length).toBe(examples.length);
    const of = (wanted: ReturnType<typeof kind>) =>
      examples.filter((example) => kind(example) === wanted);
    expect(of("unclassified")).toEqual([]);
    expect(of("layout").length).toBeGreaterThan(0);
    expect(of("design").length).toBeGreaterThan(0);
    expect(of("node").length).toBeGreaterThan(0);

    for (const layout of of("layout"))
      expect(outcome(validateLayout(layout))).toEqual({ upgradedFrom: LAYOUT_SCHEMA_VERSION });
    for (const design of of("design"))
      expect(outcome(validateDesign(design))).toEqual({ upgradedFrom: DESIGN_SCHEMA_VERSION });
    for (const node of of("node")) {
      const root = { id: "root0001", type: "container", props: {}, children: [node] };
      const page = { schemaVersion: LAYOUT_SCHEMA_VERSION, root };
      expect(outcome(validateLayout(page))).toEqual({ upgradedFrom: LAYOUT_SCHEMA_VERSION });
    }

    const [title] = doc.split(/\r?\n/, 1);
    const literal = doc.match(/`schemaVersion` is the literal `(\d+)`/)?.[1];
    expect(title).toBe(`# Layout format (schema ${LAYOUT_SCHEMA_VERSION})`);
    expect(literal).toBe(`${LAYOUT_SCHEMA_VERSION}`);
  });
});
