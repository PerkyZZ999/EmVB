import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { s1Page } from "../fixtures/layouts.ts";
import { createTestRuntime, ROLES, userWithRole } from "./runtime.ts";

let t: Awaited<ReturnType<typeof createTestRuntime>>;
beforeEach(async () => {
  t = await createTestRuntime();
  await t.agentSettings();
});
afterEach(async () => {
  await t.dispose();
});

const editor = () => userWithRole(ROLES.editor);
const call = async <T = Record<string, unknown>>(tool: string, input: unknown) => {
  const result = (await t.mcp(tool, input, editor())) as {
    success: boolean;
    data?: unknown;
    error?: unknown;
  };
  if (!result.success) throw new Error(JSON.stringify(result.error));
  return result.data as T;
};
const fail = async (tool: string, input: unknown) => {
  const result = (await t.mcp(tool, input, editor())) as {
    success: boolean;
    error?: { code: string; message: string };
  };
  expect(result.success).toBe(false);
  if (!result.error) throw new Error("expected an error");
  return result.error;
};
type Node = {
  id: string;
  type: string;
  classes?: string[];
  children?: Node[];
  props?: Record<string, unknown>;
};
type Styles = {
  design: { classes?: { id: string; name: string; style: Record<string, unknown> }[] };
};

const newPage = async () => {
  const created = (await t.savePage({ title: "Home", layout: s1Page() })) as {
    data: { item: { id: string } };
  };
  return created.data.item.id;
};
const layoutOf = async (pageId: string) =>
  await call<{ layout: { root: Node }; rev: string }>("get_layout", { pageId });

/** A page with a heading that uses the class "Card" (red). Returns the page and heading ids. */
const pageWithCard = async () => {
  await call("update_site_styles", {
    classes: [{ id: "card", name: "Card", style: { color: "#ff0000" } }],
  });
  const pageId = await newPage();
  const { layout } = await layoutOf(pageId);
  const added = await call<{ changed: string[] }>("add_element", {
    pageId,
    parentId: layout.root.id,
    element: { type: "heading", props: { text: "Saved hello", level: 2 }, classes: ["card"] },
  });
  return { pageId, headingId: added.changed[0] ?? "" };
};

describe("saved sections over MCP (W-875)", () => {
  test("save, list, insert and delete; the copy gets fresh ids and keeps its class", async () => {
    const { pageId, headingId } = await pageWithCard();
    const saved = await call<{ id: string; name: string }>("save_section", {
      pageId,
      elementId: headingId,
      name: "  Greeting  ",
    });
    expect(saved.name).toBe("Greeting");
    const list = await call<{ sections: { id: string; name: string; classCount: number }[] }>(
      "list_saved_sections",
      {},
    );
    expect(list.sections).toEqual([
      expect.objectContaining({ id: saved.id, name: "Greeting", classCount: 1 }),
    ]);
    const inserted = await call<{ changed: string[]; classes: string | null }>(
      "insert_saved_section",
      { pageId, sectionId: saved.id },
    );
    expect(inserted.classes).toBeNull();
    const { layout } = await layoutOf(pageId);
    const copy = layout.root.children?.find((n) => n.id === inserted.changed[0]);
    expect(copy?.id).not.toBe(headingId);
    expect(copy?.classes).toEqual(["card"]);
    expect(copy?.props?.["text"]).toBe("Saved hello");
    await call("delete_saved_section", { sectionId: saved.id });
    expect((await call<{ sections: unknown[] }>("list_saved_sections", {})).sections).toEqual([]);
    expect((await fail("delete_saved_section", { sectionId: saved.id })).code).toBe("NOT_FOUND");
  });

  test("a class whose look changed since the save is added as a numbered copy, never overwritten", async () => {
    const { pageId, headingId } = await pageWithCard();
    const saved = await call<{ id: string }>("save_section", {
      pageId,
      elementId: headingId,
      name: "Hi",
    });
    await call("update_site_styles", {
      classes: [{ id: "card", name: "Card", style: { color: "#0000ff" } }],
    });
    const out = await call<{ changed: string[]; classes: string | null }>("insert_saved_section", {
      pageId,
      sectionId: saved.id,
    });
    expect(out.classes).toBe("Classes: 1 added as a copy (Card → Card 2).");
    const styles = await call<Styles>("get_site_styles", {});
    const card = styles.design.classes?.find((c) => c.id === "card");
    const copy = styles.design.classes?.find((c) => c.name === "Card 2");
    expect(card?.style["color"]).toBe("#0000ff");
    expect(copy?.style["color"]).toBe("#ff0000");
    const { layout } = await layoutOf(pageId);
    const node = layout.root.children?.find((n) => n.id === out.changed[0]);
    expect(node?.classes).toEqual([copy?.id ?? ""]);
  });

  test("a refused place adds no classes to the styles draft", async () => {
    const { pageId, headingId } = await pageWithCard();
    const saved = await call<{ id: string }>("save_section", {
      pageId,
      elementId: headingId,
      name: "Hi",
    });
    await call("update_site_styles", { removeClasses: ["card"], force: true });
    const error = await fail("insert_saved_section", {
      pageId,
      sectionId: saved.id,
      parentId: headingId,
    });
    expect(error.code).toBe("REFUSED");
    const styles = await call<Styles>("get_site_styles", {});
    expect(styles.design.classes ?? []).toEqual([]);
  });

  test("a stale rev is refused before any class reaches the styles draft (W-879)", async () => {
    const { pageId, headingId } = await pageWithCard();
    const saved = await call<{ id: string }>("save_section", {
      pageId,
      elementId: headingId,
      name: "Hi",
    });
    await call("update_site_styles", {
      classes: [{ id: "card", name: "Card", style: { color: "#00ff00" } }],
    });
    const error = await fail("insert_saved_section", {
      pageId,
      sectionId: saved.id,
      expectedRev: "c3RhbGU=",
    });
    expect(error.code).toBe("CONFLICT");
    const styles = await call<Styles>("get_site_styles", {});
    expect((styles.design.classes ?? []).map((c) => c.name)).toEqual(["Card"]);
  });

  test("bad ids, the page root and unknown sections are refused with a reason", async () => {
    const { pageId } = await pageWithCard();
    const { layout } = await layoutOf(pageId);
    expect(
      (await fail("save_section", { pageId, elementId: layout.root.id, name: "All" })).code,
    ).toBe("REFUSED");
    expect(
      (await fail("insert_saved_section", { pageId, sectionId: "0123456789abcdef" })).code,
    ).toBe("NOT_FOUND");
    expect((await fail("insert_saved_section", { pageId, sectionId: "nope" })).code).not.toBe(
      "INTERNAL_ERROR",
    );
  });
});

describe("saved sections routes (W-875)", () => {
  const record = {
    version: 1,
    name: "Banner",
    layout: {
      schemaVersion: 15,
      root: {
        id: "savedsection",
        type: "container",
        props: {},
        children: [{ id: "bannerhd", type: "heading", props: { text: "Banner", level: 2 } }],
      },
    },
    designSchemaVersion: 15,
    classes: [],
  };

  test("editors save (old schema upgraded), list, get, rename and delete", async () => {
    const saved = await t.route("saved-sections/save", { user: editor(), body: { record } });
    expect(saved.status).toBe(200);
    const id = (saved.body["data"] as { id: string }).id;
    const got = await t.route("saved-sections/get", { user: editor(), body: { id } });
    const section = (got.body["data"] as { section: { name: string; node: Node } }).section;
    expect(section.node.type).toBe("heading");
    const renamed = await t.route("saved-sections/rename", {
      user: editor(),
      body: { id, name: "Top" },
    });
    expect((renamed.body["data"] as { item: { name: string } }).item.name).toBe("Top");
    const list = await t.route("saved-sections", { user: editor() });
    expect((list.body["data"] as { items: { name: string }[] }).items.map((i) => i.name)).toEqual([
      "Top",
    ]);
    expect((await t.route("saved-sections/delete", { user: editor(), body: { id } })).status).toBe(
      200,
    );
    expect((await t.route("saved-sections/delete", { user: editor(), body: { id } })).status).toBe(
      404,
    );
  });

  test("a hand-written record the checks refuse is not stored", async () => {
    const bad = {
      ...record,
      layout: { ...record.layout, root: { ...record.layout.root, type: "script" } },
    };
    const saved = await t.route("saved-sections/save", { user: editor(), body: { record: bad } });
    expect(saved.status).toBe(422);
    const list = await t.route("saved-sections", { user: editor() });
    expect((list.body["data"] as { items: unknown[] }).items).toEqual([]);
  });

  test("authors and below can't use saved sections", async () => {
    const author = userWithRole(ROLES.author);
    expect((await t.route("saved-sections", { user: author })).status).toBe(403);
    const saved = await t.route("saved-sections/save", { user: author, body: { record } });
    expect(saved.status).toBe(403);
  });
});
