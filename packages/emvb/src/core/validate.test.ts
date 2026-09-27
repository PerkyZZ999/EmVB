import { describe, expect, test } from "bun:test";
import { container, heading, layoutOfBytes, nested, s1Page } from "../../test/fixtures/layouts.ts";
import { MAX_DEPTH, MAX_DESIGN_BYTES, MAX_LAYOUT_BYTES, MAX_NODES } from "./limits.ts";
import { validateDesign, validateLayout } from "./validate.ts";

const issuesOf = (input: unknown) => {
  const result = validateLayout(input);
  if (result.ok) throw new Error("expected the layout to be rejected");
  return result.issues;
};

describe("valid layouts", () => {
  test("the S1 page parses and keeps its content", () => {
    const result = validateLayout(s1Page());
    expect(result).toEqual({ ok: true, layout: s1Page(), upgradedFrom: 1 });
  });

  test("an empty root container is valid", () => {
    expect(validateLayout({ schemaVersion: 1, root: container("root0001") }).ok).toBe(true);
  });
});

const withChild = (child: unknown) => ({
  schemaVersion: 1,
  root: { ...container("root0001"), children: [child] },
});

describe("invalid layouts fail with the exact path", () => {
  test.each([
    [
      "unknown element type",
      withChild({ id: "abcd1234", type: "marquee", props: {} }),
      "root.children[0].type",
      "invalid_union",
    ],
    [
      "missing required prop",
      withChild({ id: "abcd1234", type: "heading", props: { text: "x" } }),
      "root.children[0].props.level",
      "invalid_type",
    ],
    [
      "wrong prop type",
      withChild({ ...heading("abcd1234"), props: { text: 5, level: 1 } }),
      "root.children[0].props.text",
      "invalid_type",
    ],
    [
      "heading level out of range",
      withChild(heading("abcd1234", "x", 7)),
      "root.children[0].props.level",
      "too_big",
    ],
    [
      "unknown prop",
      withChild({ ...heading("abcd1234"), props: { text: "x", level: 1, onclick: "x" } }),
      "root.children[0].props",
      "unrecognized_keys",
    ],
    ["bad id", withChild(heading("a b")), "root.children[0].id", "invalid_format"],
    [
      "style injection attempt",
      withChild({ ...heading("abcd1234"), style: { color: "red;}body{x:y" } }),
      "root.children[0].style.color",
      "invalid_format",
    ],
    [
      "unknown style property",
      withChild({ ...heading("abcd1234"), style: { position: "fixed" } }),
      "root.children[0].style",
      "unrecognized_keys",
    ],
    [
      "negative gap",
      {
        schemaVersion: 1,
        root: { ...container("root0001"), style: { gap: { value: -1, unit: "px" } } },
      },
      "root.style.gap.value",
      "too_small",
    ],
    [
      "root is not a container",
      { schemaVersion: 1, root: heading("root0001") },
      "root.type",
      "invalid_value",
    ],
  ])("%s", (_name, input, path, code) => {
    expect(issuesOf(input)).toContainEqual(expect.objectContaining({ path, code }));
  });

  test("duplicate ids are reported at the second occurrence", () => {
    const input = {
      schemaVersion: 1,
      root: container("root0001", [
        heading("same0001"),
        container("cont0001", [heading("same0001")]),
      ]),
    };
    expect(issuesOf(input)).toEqual([
      {
        path: "root.children[1].children[0].id",
        code: "duplicate_id",
        message: 'The id "same0001" is used more than once.',
      },
    ]);
  });

  test("nesting deeper than the limit is refused at the offending node", () => {
    expect(validateLayout(nested(MAX_DEPTH)).ok).toBe(true);
    const issues = issuesOf(nested(MAX_DEPTH + 1));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("too_deep");
    expect(issues[0]?.path).toBe(`root${".children[0]".repeat(MAX_DEPTH)}`);
  });

  test("more nodes than the limit are refused", () => {
    const children = Array.from({ length: MAX_NODES - 1 }, (_, i) =>
      heading(`h${String(i).padStart(7, "0")}`, "x"),
    );
    expect(validateLayout({ schemaVersion: 1, root: container("root0001", children) }).ok).toBe(
      true,
    );
    children.push(heading("hextra01", "x"));
    expect(issuesOf({ schemaVersion: 1, root: container("root0001", children) })).toEqual([
      expect.objectContaining({ code: "too_many_nodes" }),
    ]);
  });

  test("absurd nesting is refused without overflowing the stack", () => {
    let node: unknown = { id: "leaf0001", type: "heading", props: { text: "x", level: 1 } };
    for (let i = 0; i < 50_000; i++)
      node = { id: "c0000001", type: "container", props: {}, children: [node] };
    expect(issuesOf({ schemaVersion: 1, root: node })[0]?.code).toBe("too_deep");
  });
});

describe("size budget (N-005, K12)", () => {
  test("a layout of exactly the limit is accepted", () => {
    const doc = layoutOfBytes(MAX_LAYOUT_BYTES);
    expect(validateLayout(doc).ok).toBe(true);
  });

  test("one byte over the limit is refused with a size error", () => {
    expect(issuesOf(layoutOfBytes(MAX_LAYOUT_BYTES + 1))).toEqual([
      {
        path: "",
        code: "too_large",
        message: `The page is ${MAX_LAYOUT_BYTES + 1} bytes; the limit is ${MAX_LAYOUT_BYTES}.`,
      },
    ]);
  });

  test("the limit counts UTF-8 bytes, not characters", () => {
    const doc = layoutOfBytes(MAX_LAYOUT_BYTES + 2, "é");
    expect(JSON.stringify(doc).length).toBeLessThan(MAX_LAYOUT_BYTES);
    expect(issuesOf(doc)[0]?.code).toBe("too_large");
  });
});

describe("versions", () => {
  test("a newer schema version is refused with an update message", () => {
    expect(issuesOf({ ...s1Page(), schemaVersion: 2 })).toEqual([
      expect.objectContaining({ path: "schemaVersion", code: "newer-version" }),
    ]);
  });

  test("a missing version is refused", () => {
    const { schemaVersion: _drop, ...rest } = s1Page();
    expect(issuesOf(rest)[0]?.code).toBe("missing-version");
  });

  test("non-objects are refused", () => {
    for (const input of [null, "x", 3, []]) expect(issuesOf(input)[0]?.code).toBe("not-an-object");
  });
});

const color = (i: number) => ({ id: `c-${i}`, name: `Colour ${i}`, value: "#123456" });
const design = (colors: unknown[]) => ({ schemaVersion: 1 as const, variables: { colors } });

describe("design system document (D-013)", () => {
  test("a valid design parses", () => {
    expect<unknown>(validateDesign(design([color(1)]))).toEqual({
      ok: true,
      design: design([color(1)]),
      upgradedFrom: 1,
    });
  });

  test("invalid colour values and ids fail with their path", () => {
    const result = validateDesign(design([color(1), { id: "Bad Id", name: "x", value: "red;}" }]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((i) => i.path).toSorted()).toEqual([
      "variables.colors[1].id",
      "variables.colors[1].value",
    ]);
  });

  test("a design over 256 KiB is refused before schema checks", () => {
    const big = { ...design([]), padding: "x".repeat(MAX_DESIGN_BYTES) };
    const result = validateDesign(big);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([expect.objectContaining({ code: "too_large" })]);
    expect(result.issues[0]?.message).toContain(`the limit is ${MAX_DESIGN_BYTES}`);
  });

  test("a newer design version is refused", () => {
    const result = validateDesign({ ...design([]), schemaVersion: 3 });
    expect(result.ok ? undefined : result.issues[0]?.code).toBe("newer-version");
  });
});
