import { describe, expect, test } from "bun:test";
import { validateConditions } from "./theme/conditions.ts";
import { validateTriggers } from "./theme/triggers.ts";
import { validateDesign, validateLayout } from "./validate.ts";

// S-03: zod 4.5.4 makes one issue per bad array item before it checks `.max()`, and every
// element re-emitted its issues to its parent, so a 512 KB layout held 180 to 260 MB. These are
// the audit's proof-of-concept inputs: each must answer with a short list, quickly.

const zeros = (n: number) => Array.from({ length: n }, () => 0);
const root = (...children: unknown[]) => ({
  schemaVersion: 18,
  root: { id: "root0001", type: "container", props: {}, children },
});

type Outcome = { ok: boolean; issues?: unknown[] };
/** Issues and the fastest of up to three runs, so a busy machine doesn't fail a fast check. */
function measure(run: () => Outcome, limit = 100) {
  let best = Number.POSITIVE_INFINITY;
  let result: Outcome = { ok: true };
  for (let i = 0; i < 3 && best >= limit; i++) {
    const started = performance.now();
    result = run();
    best = Math.min(best, performance.now() - started);
  }
  return { ms: best, ok: result.ok, issues: result.issues?.length ?? 0 };
}

describe("validation stays small on crafted documents (S-03)", () => {
  test.each([
    [
      "an element with 250,000 hiddenOn items",
      () =>
        validateLayout(
          root({
            id: "node0001",
            type: "container",
            props: {},
            hiddenOn: zeros(250_000),
            children: [],
          }),
        ),
    ],
    [
      "1,150 Lists with 200 bad items each (every array within its bounds)",
      () =>
        validateLayout(
          root(
            ...Array.from({ length: 1150 }, (_, i) => ({
              id: `list${String(i).padStart(4, "0")}`,
              type: "list",
              props: { items: zeros(200) },
            })),
          ),
        ),
    ],
    [
      "120,000 bad design colours",
      () => validateDesign({ schemaVersion: 1, variables: { colors: zeros(120_000) } }),
    ],
    [
      "120,000 bad design classes",
      () =>
        validateDesign({ schemaVersion: 1, variables: { colors: [] }, classes: zeros(120_000) }),
    ],
    [
      "100,000 bad condition rules",
      () => validateConditions({ schemaVersion: 1, rules: zeros(100_000) }),
    ],
    [
      "100,000 bad popup triggers",
      () => validateTriggers({ schemaVersion: 1, open: zeros(100_000) }),
    ],
  ])("%s: at most 50 issues in under 100 ms", (_label, run) => {
    const { ms, ok, issues } = measure(run);
    expect(ok).toBe(false);
    expect(issues).toBeGreaterThan(0);
    expect(issues).toBeLessThanOrEqual(50);
    expect(ms).toBeLessThan(100);
  });

  test("an element reports ten issues, then how many more", () => {
    const result = validateLayout(
      root({ id: "list0001", type: "list", props: { items: zeros(200) } }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(11);
    expect(result.issues[0]).toEqual({
      path: "root.children[0].props.items[0]",
      code: "invalid_type",
      message: "Invalid input: expected string, received number",
    });
    expect(result.issues[10]).toEqual({
      path: "root.children[0]",
      code: "too_many_issues",
      message: "…and 190 more problems in this element.",
    });
  });

  test("a single bad item keeps its path, code and message", () => {
    const result = validateLayout(
      root({ id: "list0001", type: "list", props: { items: ["a", 1, "c"] } }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      {
        path: "root.children[0].props.items[1]",
        code: "invalid_type",
        message: "Invalid input: expected string, received number",
      },
    ]);
  });

  test("children stop being read once they have reported enough", () => {
    const result = validateLayout(
      root(
        ...Array.from({ length: 30 }, (_, i) => ({
          id: `list${String(i).padStart(4, "0")}`,
          type: "list",
          props: { items: zeros(20) },
        })),
      ),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Four Lists report 11 issues each; the fifth and later aren't read.
    expect(result.issues).toHaveLength(45);
    expect(result.issues[44]).toEqual({
      path: "root.children[4]",
      code: "too_many_issues",
      message: "…and more problems in the elements after this one.",
    });
  });

  test("an oversized design array is one issue about its length", () => {
    const result = validateDesign({ schemaVersion: 1, variables: { colors: zeros(120_000) } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      { path: "variables.colors", code: "too_big", message: "Too many items: at most 200." },
    ]);
  });

  test("an unknown key holding a long array is checked without a copy per item", () => {
    const { ms, ok } = measure(
      () =>
        validateLayout(
          root({
            id: "node0001",
            type: "container",
            props: {},
            someKey: zeros(250_000),
            children: [],
          }),
        ),
      40,
    );
    expect(ok).toBe(true);
    expect(ms).toBeLessThan(40);
  });

  test("a document reports 49 issues, then how many more", () => {
    const result = validateDesign({ schemaVersion: 1, variables: { colors: zeros(200) } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(50);
    expect(result.issues[0]?.path).toBe("variables.colors[0]");
    expect(result.issues[49]).toEqual({
      path: "",
      code: "too_many_issues",
      message: "…and 151 more problems.",
    });
  });
});
