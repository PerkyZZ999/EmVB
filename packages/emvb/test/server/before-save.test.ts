import { describe, expect, test } from "bun:test";
import { s1Page } from "../fixtures/layouts.ts";
import { PAGES_COLLECTION, THEME_PARTS_COLLECTION } from "../../src/constants.ts";
import { beforeSave } from "../../src/server/hooks.ts";

function run(collection: string, content: Record<string, unknown>, role?: number) {
  const warnings: unknown[][] = [];
  const ctx = { log: { warn: (...args: unknown[]) => void warnings.push(args) } } as never;
  const result = beforeSave(
    {
      collection,
      id: "01PAGE",
      content,
      isNew: false,
      ...(role ? { actor: { id: "u", role } } : {}),
    },
    ctx,
  );
  return { result, warnings };
}

const failure = (result: Promise<unknown>) =>
  result.then(
    () => "saved",
    (e: Error) => e.message,
  );

describe("content:beforeSave, called directly (R-006, D-020)", () => {
  test("a layout sent as a JSON string is validated like an object and saved", async () => {
    expect(
      await run(PAGES_COLLECTION, { layout: JSON.stringify(s1Page()) }).result,
    ).toBeUndefined();
  });

  test("an old layout sent as a JSON string is stored upgraded, as an object", async () => {
    const { result } = run(PAGES_COLLECTION, {
      title: "Home",
      layout: JSON.stringify({ ...s1Page(), schemaVersion: 1 }),
    });
    expect(await result).toEqual({ title: "Home", layout: s1Page() });
  });

  test("an upgraded layout keeps the entry's other fields", async () => {
    const { result } = run(PAGES_COLLECTION, {
      title: "Home",
      canvas_mode: "blank",
      layout: { ...s1Page(), schemaVersion: 2 },
    });
    expect(await result).toEqual({ title: "Home", canvas_mode: "blank", layout: s1Page() });
  });

  test("a JSON string that isn't JSON is rejected, not saved", async () => {
    const { result, warnings } = run(PAGES_COLLECTION, { layout: "{not json" });
    expect(await failure(result)).toStartWith("The page layout is invalid.");
    expect(warnings).toEqual([
      ["emvb: page save rejected", { pageId: "01PAGE", code: "not-an-object" }],
    ]);
  });

  test("an author saving a theme part is refused with the theme-part wording and a role code", async () => {
    const { result, warnings } = run(THEME_PARTS_COLLECTION, { title: "Header" }, 30);
    expect(await failure(result)).toBe(
      "Only editors and administrators can save EmVB theme parts.",
    );
    expect(warnings).toEqual([
      ["emvb: theme part save rejected", { pageId: "01PAGE", code: "role" }],
    ]);
  });

  test("an author saving a page is refused with the page wording and a role code", async () => {
    const { result, warnings } = run(PAGES_COLLECTION, { layout: s1Page() }, 30);
    expect(await failure(result)).toBe("Only editors and administrators can save EmVB pages.");
    expect(warnings).toEqual([["emvb: page save rejected", { pageId: "01PAGE", code: "role" }]]);
  });

  test("a theme part's invalid conditions give the first issue messages and the issue code", async () => {
    const { result, warnings } = run(THEME_PARTS_COLLECTION, { conditions: { rules: "nope" } });
    expect(await failure(result)).toBe(
      "The theme part conditions are invalid. Invalid input: expected 1; Invalid input: expected array, received string",
    );
    expect(warnings).toEqual([
      ["emvb: theme part save rejected", { pageId: "01PAGE", code: "invalid_value" }],
    ]);
  });
});

describe("elements in the wrong place are refused at save (W-225)", () => {
  test("a menu item outside a Menu is refused with the editor's reason", async () => {
    const layout = {
      schemaVersion: 12,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [{ id: "mitm0001", type: "menu-item", props: { text: "Home" }, children: [] }],
      },
    };
    const { result, warnings } = run(PAGES_COLLECTION, { layout });
    expect(await failure(result)).toBe(
      "The page layout has elements in the wrong place. Menu items can only go inside a Menu. (menu-item mitm0001)",
    );
    expect(warnings).toEqual([["emvb: page save rejected", { pageId: "01PAGE", code: "nesting" }]]);
  });
});
