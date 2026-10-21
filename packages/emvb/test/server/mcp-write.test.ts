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
const newPage = async () => {
  const created = (await t.savePage({ title: "Home", layout: s1Page() })) as {
    data: { item: { id: string } };
  };
  return created.data.item.id;
};
type Layout = {
  root: { id: string; children?: { id: string; type: string; props?: Record<string, unknown> }[] };
};
const layoutOf = async (pageId: string) =>
  await call<{ layout: Layout; rev: string }>("get_layout", { pageId });

describe("EmVB MCP write tools (W-457, W-458)", () => {
  test("add_element saves a validated draft and returns the new rev", async () => {
    const pageId = await newPage();
    const before = await layoutOf(pageId);
    const out = await call<{ rev: string; changed: string[] }>("add_element", {
      pageId,
      parentId: before.layout.root.id,
      element: { type: "heading", props: { text: "Hello agent", level: 2 } },
    });
    expect(out.rev).not.toBe(before.rev);
    expect(out.changed).toHaveLength(1);
    const after = await layoutOf(pageId);
    expect(JSON.stringify(after.layout)).toContain("Hello agent");
  });

  test("a stale expectedRev is a conflict and changes nothing", async () => {
    const pageId = await newPage();
    const before = await layoutOf(pageId);
    await call("add_element", {
      pageId,
      parentId: before.layout.root.id,
      element: { type: "heading" },
    });
    const error = await fail("add_element", {
      pageId,
      parentId: before.layout.root.id,
      element: { type: "heading" },
      expectedRev: before.rev,
    });
    expect(error.code).toBe("CONFLICT");
  });

  test("invalid nesting is refused with the editor's reason", async () => {
    const pageId = await newPage();
    const { layout } = await layoutOf(pageId);
    const heading = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: layout.root.id,
      element: { type: "heading" },
    });
    const error = await fail("add_element", {
      pageId,
      parentId: heading.changed[0],
      element: { type: "section" },
    });
    expect(error.code).not.toBe("INTERNAL_ERROR");
  });

  test("a change that breaks the layout schema is refused and not saved", async () => {
    const pageId = await newPage();
    const { layout, rev } = await layoutOf(pageId);
    const added = await call<{ changed: string[]; rev: string }>("add_element", {
      pageId,
      parentId: layout.root.id,
      element: { type: "heading" },
    });
    const error = await fail("update_element", {
      pageId,
      nodeId: added.changed[0],
      set: { props: { level: 99 } },
    });
    expect(error.code).toBe("INVALID_LAYOUT");
    expect((await layoutOf(pageId)).rev).toBe(added.rev);
    expect(rev).not.toBe(added.rev);
  });

  test("update and remove change only the draft; the published page is untouched", async () => {
    const pageId = await newPage();
    const { layout } = await layoutOf(pageId);
    const added = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: layout.root.id,
      element: { type: "heading" },
    });
    const id = added.changed[0];
    await call("update_element", { pageId, nodeId: id, set: { props: { text: "Changed" } } });
    expect(JSON.stringify((await layoutOf(pageId)).layout)).toContain("Changed");
    await call("remove_element", { pageId, nodeId: id });
    expect(JSON.stringify((await layoutOf(pageId)).layout)).not.toContain(id);
  });

  test("W-755: props set to null or a list is an invalid layout, not an internal error", async () => {
    const pageId = await newPage();
    const { layout } = await layoutOf(pageId);
    const image = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: layout.root.id,
      element: { type: "image", props: { src: "/a.jpg", alt: "A" } },
    });
    const ids = [layout.root.children?.[0]?.id as string, image.changed[0] as string];
    for (const nodeId of ids) {
      for (const props of [null, ["x"]]) {
        // oxlint-disable-next-line no-await-in-loop -- one write after another
        const error = await fail("update_element", { pageId, nodeId, set: { props } });
        expect(error.code).toBe("INVALID_LAYOUT");
      }
    }
  });

  test("create_page creates an unpublished page with recipes and refuses a taken slug", async () => {
    const out = await call<{ pageId: string; slug: string }>("create_page", {
      title: "About us",
      recipes: ["hero"],
    });
    expect(out.slug).toBe("about-us");
    const pages = await call<{ pages: { id: string; status: string }[] }>("list_pages", {});
    expect(pages.pages.find((p) => p.id === out.pageId)?.status).not.toBe("published");
    const error = await fail("create_page", { title: "About us" });
    expect(error.message).toContain("taken");
  });

  test("create_page finds a taken slug past the first 50 pages (W-537)", async () => {
    await call("create_page", { title: "Oldest page" });
    for (let i = 0; i < 55; i++) {
      // oxlint-disable-next-line no-await-in-loop -- sequential page creation
      await call("create_page", { title: `Filler ${i}` });
    }
    const error = await fail("create_page", { title: "Oldest page" });
    expect(error.message).toContain("taken");
  });

  test("create_page takes non-Latin titles and checks the slug EmDash makes (W-554)", async () => {
    const jp = await call<{ slug: string }>("create_page", { title: "日本語のページ" });
    expect(jp.slug).toBe("日本語のページ");
    const ar = await call<{ slug: string }>("create_page", { title: "مرحبا بالعالم" });
    expect(ar.slug).toBe("مرحبا-بالعالم");
    await call("create_page", { title: "Café crème" });
    // The same title typed with combining accents makes the same slug, so it's taken.
    const error = await fail("create_page", { title: "Cafe\u0301 cre\u0300me" });
    expect(error.message).toContain("taken");
    expect((await fail("create_page", { title: "🎉🎉" })).code).toBe("REFUSED");
  });

  test("a write that changes nothing saves no version and keeps the rev (W-562)", async () => {
    const pageId = await newPage();
    const before = await layoutOf(pageId);
    const versions = async () =>
      (await call<{ versions: unknown[] }>("list_versions", { pageId })).versions.length;
    const count = await versions();
    const heading = before.layout.root.children?.[0]?.id ?? "";
    for (const input of [
      { pageId, nodeId: heading },
      { pageId, nodeId: heading, set: {} },
      { pageId, nodeId: heading, set: { props: { text: "Welcome" } } },
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one write at a time
      const out = await call<{ rev: string; changed: string[]; summary: string }>(
        "update_element",
        input,
      );
      expect(out.rev).toBe(before.rev);
      expect(out.changed).toEqual([]);
      expect(out.summary).toContain("Nothing changed");
    }
    const moved = await call<{ rev: string }>("move_element", {
      pageId,
      nodeId: heading,
      parentId: before.layout.root.id,
      index: 0,
    });
    expect(moved.rev).toBe(before.rev);
    expect(await versions()).toBe(count);
  });

  test("a link the page would drop is refused with the reason (W-563)", async () => {
    const pageId = await newPage();
    const { layout } = await layoutOf(pageId);
    const error = await fail("add_element", {
      pageId,
      parentId: layout.root.id,
      element: { type: "button", props: { text: "Go", href: "javascript:alert(1)" } },
    });
    expect(error.code).toBe("REFUSED");
    expect(error.message).toContain("javascript:alert(1)");
    const heading = layout.root.children?.[0]?.id ?? "";
    expect(
      (
        await fail("update_element", {
          pageId,
          nodeId: heading,
          set: { props: { href: "vbscript:x" } },
        })
      ).code,
    ).toBe("REFUSED");
    await call("update_element", { pageId, nodeId: heading, set: { props: { href: "/pricing" } } });
    await call("add_element", {
      pageId,
      parentId: layout.root.id,
      element: { type: "button", props: { text: "Mail", href: "mailto:hi@example.com" } },
    });
  });

  test("SVG markup the page would drop is refused with the reason (W-566)", async () => {
    const pageId = await newPage();
    const { layout } = await layoutOf(pageId);
    const bad = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle r="4"/></svg>';
    const error = await fail("add_element", {
      pageId,
      parentId: layout.root.id,
      element: { type: "svg", props: { markup: bad } },
    });
    expect(error.code).toBe("REFUSED");
    expect(error.message).toContain("SVG");
    const icon = await fail("add_element", {
      pageId,
      parentId: layout.root.id,
      element: { type: "icon", props: { iconSvg: bad } },
    });
    expect(icon.code).toBe("REFUSED");
    await call("add_element", {
      pageId,
      parentId: layout.root.id,
      element: {
        type: "svg",
        props: { markup: '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>' },
      },
    });
  });

  test("update_site_styles names ids it can't remove and saves nothing for a no-op (W-564)", async () => {
    const first = await call<{ revision: string }>("update_site_styles", {
      variables: { colors: [{ id: "brand", name: "Brand", value: "#0055ff" }] },
    });
    const missing = await fail("update_site_styles", {
      removeVariables: [{ kind: "colors", id: "nope" }],
      removeClasses: ["ghost"],
    });
    expect(missing.code).toBe("NOT_FOUND");
    expect(missing.message).toContain("nope");
    expect(missing.message).toContain("ghost");
    const same = await call<{ revision: string; summary: string }>("update_site_styles", {
      variables: { colors: [{ id: "brand", name: "Brand", value: "#0055ff" }] },
    });
    expect(same.revision).toBe(first.revision);
    expect(same.summary).toContain("Nothing changed");
  });

  test("update_site_styles refuses a class or variable name another one has (W-573)", async () => {
    await call("update_site_styles", {
      classes: [{ id: "card", name: "Café card", style: {} }],
      variables: { colors: [{ id: "brand", name: "Brand", value: "#0055ff" }] },
    });
    const cls = await fail("update_site_styles", {
      classes: [{ id: "card-2", name: "cafe\u0301 CARD", style: {} }],
    });
    expect(cls.code).toBe("INVALID_INPUT");
    expect(cls.message).toContain("Café card");
    const twice = await fail("update_site_styles", {
      variables: {
        colors: [
          { id: "a", name: "Accent", value: "#111111" },
          { id: "b", name: "accent", value: "#222222" },
        ],
      },
    });
    expect(twice.message).toContain("Accent");
    // Renaming in place and other kinds sharing a name are fine.
    await call("update_site_styles", {
      classes: [{ id: "card", name: "Café card", style: { color: "#000000" } }],
      variables: { spacings: [{ id: "brand", name: "Brand", value: { value: 8, unit: "px" } }] },
    });
  });

  test("update_site_styles refuses a font stack the site CSS would drop (W-547)", async () => {
    const error = await fail("update_site_styles", {
      variables: { fonts: [{ id: "agent-font", name: "Agent font", value: "Inter; color: red" }] },
    });
    expect(error.code).toBe("INVALID_INPUT");
    await call("update_site_styles", {
      variables: { fonts: [{ id: "agent-font", name: "Agent font", value: '"Open Sans", serif' }] },
    });
  });

  test("update_site_styles writes the draft and records the history", async () => {
    const out = await call<{ revision: string }>("update_site_styles", {
      variables: { colors: [{ id: "agent-accent", name: "Agent accent", value: "#ff0066" }] },
    });
    expect(out.revision).toBeTruthy();
    const styles = await call<{ draft: unknown }>("get_site_styles", {});
    expect(JSON.stringify(styles)).toContain("agent-accent");
  });

  test("removing a variable a page still uses is refused unless forced (W-458)", async () => {
    await newPage();
    await call("update_site_styles", {
      variables: { colors: [{ id: "brand", name: "Brand", value: "#0055ff" }] },
    });
    const error = await fail("update_site_styles", {
      removeVariables: [{ kind: "colors", id: "brand" }],
    });
    expect(error.code).toBe("REFUSED");
    expect(error.message).toContain('page "Home"');
    await call("update_site_styles", {
      removeVariables: [{ kind: "colors", id: "brand" }],
      force: true,
    });
    expect(JSON.stringify(await call("get_site_styles", {}))).not.toContain('"brand"');
  });

  test("removing a class a page still uses is refused unless forced (W-504)", async () => {
    const pageId = await newPage();
    await call("update_site_styles", {
      classes: [
        { id: "card", name: "Card", style: {} },
        { id: "spare", name: "Spare", style: {} },
      ],
    });
    const { layout } = await layoutOf(pageId);
    await call("update_element", { pageId, nodeId: layout.root.id, set: { classes: ["card"] } });
    const error = await fail("update_site_styles", { removeClasses: ["card"] });
    expect(error.code).toBe("REFUSED");
    expect(error.message).toContain('card (page "Home")');
    // An unused class goes without force; the used one stays until forced.
    await call("update_site_styles", { removeClasses: ["spare"] });
    let styles = JSON.stringify(await call("get_site_styles", {}));
    expect(styles).not.toContain('"spare"');
    expect(styles).toContain('"card"');
    await call("update_site_styles", { removeClasses: ["card"], force: true });
    styles = JSON.stringify(await call("get_site_styles", {}));
    expect(styles).not.toContain('"card"');
  });

  test("a new image src drops the old picture's sizes, media id and edit record (W-510)", async () => {
    const pageId = await newPage();
    const { layout } = await layoutOf(pageId);
    const added = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: layout.root.id,
      element: {
        type: "image",
        props: {
          src: "/_emdash/api/media/file/old.jpg",
          alt: "Old",
          mediaId: "old1",
          width: 1600,
          height: 900,
          sources: [{ src: "/_emdash/api/media/file/old-800.jpg", width: 800 }],
        },
      },
    });
    const nodeId = added.changed[0] as string;
    await call("update_element", {
      pageId,
      nodeId,
      set: { props: { src: "https://example.com/new.jpg" } },
    });
    const after = JSON.stringify((await layoutOf(pageId)).layout);
    expect(after).toContain("https://example.com/new.jpg");
    expect(after).not.toContain("old-800.jpg");
    expect(after).not.toContain('"old1"');
    expect(after).not.toContain("1600");
  });

  test("viewers can't call write tools", async () => {
    const pageId = await newPage();
    const result = (await t.mcp(
      "add_element",
      { pageId, parentId: "x", element: { type: "heading" } },
      userWithRole(ROLES.contributor),
    )) as { success: boolean };
    expect(result.success).toBe(false);
  });
});
