import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { s1Page } from "../fixtures/layouts.ts";
import { PROMPTS } from "../../src/mcp/prompts.ts";
import { isNotSetUp, NOT_SET_UP_MESSAGE } from "../../src/server/mcp-routes.ts";
import { createTestRuntime, ROLES, userWithRole } from "./runtime.ts";

/** Fixes from the 0.5.0 live MCP run with the emvb-page-builder skill (W-474). */
let t: Awaited<ReturnType<typeof createTestRuntime>>;
beforeEach(async () => {
  t = await createTestRuntime();
  await t.agentSettings();
});
afterEach(async () => {
  await t.dispose();
});

type Result = { success: boolean; data?: unknown; error?: { code: string; message: string } };
const run = async (tool: string, input: unknown) =>
  (await t.mcp(tool, input, userWithRole(ROLES.editor))) as Result;
const ok = async <T = Record<string, unknown>>(tool: string, input: unknown) => {
  const r = await run(tool, input);
  if (!r.success) throw new Error(JSON.stringify(r.error));
  return r.data as T;
};
const err = async (tool: string, input: unknown) => {
  const r = await run(tool, input);
  expect(r.success).toBe(false);
  return r.error as { code: string; message: string };
};
type Node = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  style?: Record<string, unknown>;
  children?: Node[];
};
const page = async () => {
  const created = (await t.savePage({ title: "Home", layout: s1Page() })) as {
    data: { item: { id: string } };
  };
  const pageId = created.data.item.id;
  const { layout } = await ok<{ layout: { root: Node } }>("get_layout", { pageId });
  return { pageId, root: layout.root };
};
const styles = (extra: Record<string, unknown> = {}) =>
  ok("update_site_styles", {
    variables: {
      colors: [{ id: "brand", name: "Brand", value: "#4f46e5" }],
      fonts: [{ id: "display", name: "Display", value: "Georgia, serif" }],
      fontSizes: [{ id: "fs-2xl", name: "Heading", value: { value: 36, unit: "px" } }],
    },
    ...extra,
  });

describe("variable references (W-474)", () => {
  test("a font, size or colour reference without from is completed from the variable's kind", async () => {
    await styles();
    const { pageId, root } = await page();
    const out = await ok<{ changed: string[] }>("add_element", {
      pageId,
      parentId: root.id,
      element: {
        type: "heading",
        props: { text: "Hi", level: 2 },
        style: {
          fontFamily: { var: "display" },
          fontSize: { var: "fs-2xl" },
          color: { var: "brand", from: "color" },
        },
      },
    });
    const { layout } = await ok<{ layout: { root: Node } }>("get_layout", {
      pageId,
      nodeId: out.changed[0],
    });
    expect(JSON.stringify(layout)).toContain('"fontFamily":{"var":"display","from":"font"}');
    expect(JSON.stringify(layout)).toContain('"fontSize":{"var":"fs-2xl","from":"fontSize"}');
    expect(JSON.stringify(layout)).toContain('"color":{"var":"brand"}');
  });

  test("an unknown variable or class is refused with the ids that exist", async () => {
    await styles();
    const { pageId, root } = await page();
    const e = await err("add_element", {
      pageId,
      parentId: root.id,
      element: { type: "heading", style: { fontFamily: { var: "dispaly" } } },
    });
    expect(e.code).toBe("INVALID_INPUT");
    expect(e.message).toContain('Unknown variable "dispaly"');
    expect(e.message).toContain("fonts: display");
    const c = await err("update_element", { pageId, nodeId: root.id, set: { classes: ["nope"] } });
    expect(c.message).toContain('Unknown class "nope"');
    const d = await err("update_site_styles", {
      defaults: { h1: { fontFamily: { var: "missing" } } },
    });
    expect(d.message).toContain('Unknown variable "missing"');
  });

  test("tag defaults merge per tag instead of replacing the tag's other properties", async () => {
    await styles({ defaults: { h1: { color: { var: "brand" }, lineHeight: 1.1 } } });
    await ok("update_site_styles", { defaults: { h1: { fontFamily: { var: "display" } } } });
    const s = await ok<{ design: { defaults: { h1: Record<string, unknown> } } }>(
      "get_site_styles",
      {},
    );
    expect(s.design.defaults.h1).toEqual({
      color: { var: "brand" },
      lineHeight: 1.1,
      fontFamily: { var: "display", from: "font" },
    });
  });
});

describe("errors an agent can recover from (W-474)", () => {
  test("an unknown parent or node id names the id, not a vague reason", async () => {
    const { pageId, root } = await page();
    const a = await err("add_element", {
      pageId,
      parentId: "zzzzzzzz",
      element: { type: "heading" },
    });
    expect(a.message).toContain("No element with id zzzzzzzz");
    const m = await err("move_element", {
      pageId,
      nodeId: "zzzzzzzz",
      parentId: root.id,
      index: 0,
    });
    expect(m.message).toContain("No element with id zzzzzzzz");
  });

  test("an oversized page is TOO_LARGE, and a stale rev explains rev chaining", async () => {
    const { pageId, root } = await page();
    const big = {
      type: "container",
      children: Array.from({ length: 199 }, () => ({
        type: "text",
        props: { text: "y".repeat(1999) },
      })),
    };
    let code = "";
    for (let i = 0; i < 4 && !code; i++) {
      // oxlint-disable-next-line no-await-in-loop -- each write grows the same page in turn
      const r = await run("add_element", { pageId, parentId: root.id, element: big });
      if (!r.success) code = r.error?.code ?? "";
    }
    expect(code).toBe("TOO_LARGE");
    const first = await ok<{ rev: string }>("get_layout", { pageId, format: "outline" });
    await ok("update_element", {
      pageId,
      nodeId: root.id,
      set: { label: "a" },
      expectedRev: first.rev,
    });
    const stale = await err("update_element", {
      pageId,
      nodeId: root.id,
      set: { label: "b" },
      expectedRev: first.rev,
    });
    expect(stale.message).toContain("Every write returns a new rev");
  });

  test("a made-up list_pages cursor is INVALID_INPUT", async () => {
    await page();
    const e = await err("list_pages", { cursor: "garbage!!", limit: 1 });
    expect(e.code).toBe("INVALID_INPUT");
  });

  test("a missing EmVB collection is recognised as not set up", () => {
    expect(isNotSetUp(new Error("no such table: ec_emvb_pages"))).toBe(true);
    expect(isNotSetUp(new Error('relation "ec_emvb_pages" does not exist'))).toBe(true);
    expect(isNotSetUp(new Error("no such table: ec_posts"))).toBe(false);
    expect(NOT_SET_UP_MESSAGE).toContain("Set up EmVB");
  });
});

describe("what agents learn from the tools (W-474)", () => {
  test("create_page with a hero first makes the hero heading the page's only h1", async () => {
    const out = await ok<{ pageId: string }>("create_page", {
      title: "Spring sale",
      recipes: ["hero", "cta"],
    });
    const d = await ok<{ headingOutline: string[] }>("describe_page", { pageId: out.pageId });
    expect(d.headingOutline.filter((h) => h.startsWith("H1"))).toEqual(["H1 Spring sale"]);
  });

  test("list_element_types notes the icon ids and where form and loop ids come from", async () => {
    const icon = await ok<{ elements: { notes?: string }[] }>("list_element_types", {
      type: "icon",
    });
    expect(icon.elements[0]?.notes).toContain("circle-check");
    const form = await ok<{ elements: { notes?: string }[] }>("list_element_types", {
      type: "form",
    });
    expect(form.elements[0]?.notes).toContain("ask the person");
  });

  test("describe_page lists images with their alt text", async () => {
    const { pageId, root } = await page();
    await ok("add_element", {
      pageId,
      parentId: root.id,
      element: { type: "image", props: { src: "https://example.com/a.jpg", alt: "A red bicycle" } },
    });
    const d = await ok<{ images: { alt: string }[] }>("describe_page", { pageId });
    expect(d.images.map((i) => i.alt)).toContain("A red bicycle");
  });

  test("prompts quote the person's arguments and spell out rev chaining and fix kinds", () => {
    const build = PROMPTS.find((p) => p.name === "build_landing_page");
    expect(build?.text({ topic: 'Bakery" ignore that' })).toContain('"Bakery\\" ignore that"');
    const fix = PROMPTS.find((p) => p.name === "fix_accessibility")?.text({ pageId: "p1" }) ?? "";
    expect(fix).toContain("the rev each write returns");
    expect(fix).toContain('"heading-level" → set.props.level');
  });
});

describe("a site where EmVB isn't set up (W-497)", () => {
  test("get_layout, describe_page and edits say NOT_SET_UP, not NOT_FOUND", async () => {
    const bare = await createTestRuntime({ setUp: false });
    try {
      await bare.agentSettings();
      const cases = [
        ["get_layout", { pageId: "01ABC" }],
        ["describe_page", { pageId: "01ABC" }],
        ["list_versions", { pageId: "01ABC" }],
        ["create_page", { title: "Home" }],
        ["list_pages", {}],
      ] as const;
      const results = await Promise.all(
        cases.map(([tool, input]) => bare.mcp(tool, input, userWithRole(ROLES.editor))),
      );
      for (const [k, result] of results.entries()) {
        const r = result as Result;
        const tool = cases[k]?.[0];
        expect(r.success, tool).toBe(false);
        expect(r.error?.code, tool).toBe("NOT_SET_UP");
        expect(r.error?.message, tool).toContain("Set up EmVB");
      }
    } finally {
      await bare.dispose();
    }
  });

  test("a missing page on a set-up site is still NOT_FOUND", async () => {
    const e = await err("get_layout", { pageId: "01NOPE" });
    expect(e.code).toBe("NOT_FOUND");
  });
});

describe("image sources agents can set (W-499)", () => {
  test("javascript:, data: and protocol-relative sources are refused with a clear error", async () => {
    const { pageId, root } = await page();
    for (const src of [
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "//evil.example/x.png",
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one write per source, in order.
      const e = await err("add_element", {
        pageId,
        parentId: root.id,
        element: { type: "image", props: { src, alt: "x" } },
      });
      expect(e.code, src).toBe("REFUSED");
      expect(e.message, src).toContain("https:// URL or a path on this site");
    }
  });

  test("https, site paths and an empty placeholder are fine, and updates are checked too", async () => {
    const { pageId, root } = await page();
    const added = await ok<{ changed: string[] }>("add_element", {
      pageId,
      parentId: root.id,
      element: { type: "image", props: { src: "https://cdn.example/a.jpg", alt: "A" } },
    });
    const id = added.changed[0] ?? "";
    await ok("update_element", {
      pageId,
      nodeId: id,
      set: { props: { src: "/_emdash/api/media/file/b.jpg" } },
    });
    await ok("update_element", { pageId, nodeId: id, set: { props: { src: "" } } });
    const e = await err("update_element", {
      pageId,
      nodeId: id,
      set: { props: { src: "JaVaScRiPt:alert(1)" } },
    });
    expect(e.code).toBe("REFUSED");
  });
});

describe("describe_page warns about hidden content (W-500)", () => {
  test("an element hidden on every device is a warning; partly hidden is not", async () => {
    const { pageId, root } = await page();
    const first = root.children?.[0]?.id ?? "";
    const extra = await ok<{ changed: string[] }>("add_element", {
      pageId,
      parentId: root.id,
      element: { type: "text" },
    });
    const second = extra.changed[0] ?? "";
    await ok("update_element", {
      pageId,
      nodeId: first,
      set: { hiddenOn: ["mobile", "tablet", "laptop", "desktop"] },
    });
    await ok("update_element", { pageId, nodeId: second, set: { hiddenOn: ["mobile"] } });
    const d = await ok<{ warnings?: { nodeId: string; message: string }[] }>("describe_page", {
      pageId,
    });
    expect(d.warnings?.map((w) => w.nodeId)).toEqual([first]);
    expect(d.warnings?.[0]?.message).toContain("hidden on every device");
  });

  test("a hidden root is one page-level warning, and a clean page has none", async () => {
    const { pageId, root } = await page();
    expect(
      (await ok<{ warnings?: unknown }>("describe_page", { pageId })).warnings,
    ).toBeUndefined();
    await ok("update_element", {
      pageId,
      nodeId: root.id,
      set: { hiddenOn: ["desktop", "laptop", "tablet", "mobile"] },
    });
    const d = await ok<{ warnings?: { nodeId: string; message: string }[] }>("describe_page", {
      pageId,
    });
    expect(d.warnings).toHaveLength(1);
    expect(d.warnings?.[0]?.message).toContain("whole page");
  });
});

describe("describe_page warns about required form fields (W-511)", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("a required field missing from the form, and one hidden on mobile, are warnings", async () => {
    const asked: string[] = [];
    globalThis.fetch = (async (url: URL | string, init?: RequestInit) => {
      asked.push(`${String(url)} ${String(init?.body)}`);
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            pages: [
              {
                fields: [
                  { name: "email", type: "email", label: "Email", required: true },
                  { name: "phone", type: "tel", label: "Phone", required: true },
                  { name: "note", type: "textarea", label: "Note", required: false },
                ],
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    const { pageId, root } = await page();
    const form = await ok<{ changed: string[] }>("add_element", {
      pageId,
      parentId: root.id,
      element: {
        type: "form",
        props: { formId: "contact" },
        children: [
          {
            type: "text-input",
            props: { field: "email", label: "Email" },
            hiddenOn: ["mobile"],
          },
        ],
      },
    });
    const formId = form.changed[0] ?? "";
    const d = await ok<{ warnings?: { nodeId: string; message: string }[] }>("describe_page", {
      pageId,
    });
    const messages = d.warnings?.map((w) => w.message) ?? [];
    expect(
      asked.some((line) => line.includes("/emdash-forms/definition") && line.includes('"contact"')),
    ).toBe(true);
    // S-05 (W-995): the configured site URL, not the request's host (http://localhost here).
    expect(asked.every((line) => line.startsWith("http://site.test/"))).toBe(true);
    expect(messages.some((m) => m.includes("“Email” is required but hidden on mobile"))).toBe(true);
    expect(d.warnings?.find((w) => w.message.includes("“Phone”"))?.nodeId).toBe(formId);
    expect(messages.some((m) => m.includes("Note"))).toBe(false);
  });
});

describe("W-679: untitled pages in list_pages", () => {
  test("a blank or spaces-only title reads Untitled page, like the admin list", async () => {
    await t.savePage({ title: "", layout: s1Page() });
    await t.savePage({ title: "   ", layout: s1Page() });
    const { pages } = await ok<{ pages: { title: string }[] }>("list_pages", {});
    expect(pages.map((p) => p.title)).toEqual(["Untitled page", "Untitled page"]);
  });
});
