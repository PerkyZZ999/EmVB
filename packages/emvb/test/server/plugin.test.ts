import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { layoutOfBytes, s1Page } from "../fixtures/layouts.ts";
import { MAX_DESIGN_BYTES, MAX_LAYOUT_BYTES } from "../../src/core/index.ts";
import { designRoute } from "../../src/server/design-routes.ts";
import { createPlugin } from "../../src/server/plugin.ts";
import { createTestRuntime, ROLES, userWithRole } from "./runtime.ts";

let t: Awaited<ReturnType<typeof createTestRuntime>>;
beforeEach(async () => {
  t = await createTestRuntime();
});
afterEach(async () => {
  await t.dispose();
});

const design = (value = "#0055ff") => ({
  schemaVersion: 1,
  variables: {
    colors: [{ id: "brand", name: "Brand", value }],
    fonts: [],
    fontSizes: [],
    spacings: [],
  },
});

describe("content:beforeSave on emvb_pages", () => {
  test("a valid layout saved by an editor is stored", async () => {
    const result = await t.savePage({ title: "Home", layout: s1Page() });
    expect(result.success).toBe(true);
  });

  test.each([1, 2, 3, 4])(
    "a v%i layout is stored upgraded to v5 with its content unchanged (D-031, D-032, D-034, D-036)",
    async (version) => {
      const result = await t.savePage({
        title: "Home",
        layout: { ...s1Page(), schemaVersion: version },
      });
      const stored = (result as { data?: { item?: { data?: Record<string, unknown> } } }).data?.item
        ?.data?.["layout"];
      expect(stored).toEqual(s1Page());
    },
  );

  test("an invalid layout is rejected with SAVE_REJECTED and a path message", async () => {
    const layout = {
      ...s1Page(),
      root: {
        ...s1Page().root,
        children: [{ id: "abcd1234", type: "heading", props: { text: "x", level: 9 } }],
      },
    };
    const result = await t.savePage({ title: "Home", layout });
    expect(result).toMatchObject({ success: false, error: { code: "SAVE_REJECTED" } });
    expect(result.success ? "" : result.error.message).toContain("root.children[0].props.level");
  });

  test("a layout over 512 KiB is rejected with a size message", async () => {
    const result = await t.savePage({ title: "Big", layout: layoutOfBytes(MAX_LAYOUT_BYTES + 1) });
    expect(result.success ? "" : result.error.message).toContain(
      `the limit is ${MAX_LAYOUT_BYTES}`,
    );
  });

  test.each([ROLES.subscriber, ROLES.contributor, ROLES.author])(
    "a save by role %i is rejected with a role message",
    async (role) => {
      const result = await t.savePage({ title: "Home", layout: s1Page() }, role);
      expect(result).toMatchObject({ success: false, error: { code: "SAVE_REJECTED" } });
      expect(result.success ? "" : result.error.message).toContain(
        "Only editors and administrators",
      );
    },
  );

  test("admins can save", async () => {
    expect((await t.savePage({ title: "Home", layout: s1Page() }, ROLES.admin)).success).toBe(true);
  });

  test("the rejection log has the page id and code but no layout content", async () => {
    const calls: unknown[][] = [];
    const spies = (["warn", "info", "log", "error", "debug"] as const).map((m) =>
      spyOn(console, m).mockImplementation((...args: unknown[]) => void calls.push(args)),
    );
    try {
      const secret = "SECRET-HEADING-TEXT";
      const layout = {
        ...s1Page(),
        root: {
          ...s1Page().root,
          children: [{ id: "x", type: "heading", props: { text: secret, level: 1 } }],
        },
      };
      await t.savePage({ title: "Home", layout });
      const logged = JSON.stringify(calls);
      expect(logged).toContain("emvb: page save rejected");
      expect(logged).toContain("invalid_format");
      expect(logged).toContain("pageId");
      expect(logged).not.toContain(secret);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  test("other collections are left alone", async () => {
    const hooks = await import("../../src/server/hooks.ts");
    const result = await hooks.beforeSave(
      {
        collection: "posts",
        content: { layout: "junk" },
        isNew: true,
        actor: { id: "u", role: 10 },
      },
      {} as never,
    );
    expect(result).toBeUndefined();
  });
});

describe("design routes", () => {
  test("GET design is public and returns an empty design before the first save", async () => {
    expect(await t.route("design")).toEqual({
      status: 200,
      body: {
        success: true,
        data: {
          design: {
            schemaVersion: 13,
            variables: { colors: [], fonts: [], fontSizes: [], spacings: [] },
            classes: [],
          },
          revision: null,
          status: "empty",
        },
      },
    });
  });

  test("a style draft stays off the public route until styles are published", async () => {
    const editor = userWithRole(ROLES.editor);
    const first = await t.route("design/save", {
      user: editor,
      body: { design: design(), revision: null },
    });
    expect(first.status).toBe(200);
    const draftRevision = (first.body["data"] as { revision: string }).revision;
    const before = await t.route("design");
    expect(before.body["data"]).toMatchObject({ status: "empty" });
    const draft = await t.route("design/draft", { user: editor });
    expect(draft.body["data"]).toEqual({
      design: { ...design(), schemaVersion: 13 },
      revision: draftRevision,
      publishedRevision: null,
      unpublished: true,
    });
    const published = await t.route("design/publish", {
      user: editor,
      body: { publishedRevision: null },
    });
    expect(published.status).toBe(200);
    const revision = (published.body["data"] as { revision: string }).revision;
    const read = await t.route("design");
    expect(read.body["data"]).toEqual({
      design: { ...design(), schemaVersion: 13 },
      revision,
      status: "ok",
    });
  });

  test("a stale revision gets 409 and the stored design is unchanged", async () => {
    const editor = userWithRole(ROLES.editor);
    const first = await t.route("design/save", {
      user: editor,
      body: { design: design(), revision: null },
    });
    const revision = (first.body["data"] as { revision: string }).revision;
    await t.route("design/save", { user: editor, body: { design: design("#111111"), revision } });
    const stale = await t.route("design/save", {
      user: editor,
      body: { design: design("#222222"), revision },
    });
    expect(stale.status).toBe(409);
    const draft = await t.route("design/draft", { user: editor });
    expect(JSON.stringify(draft.body)).toContain("#111111");
    expect(JSON.stringify((await t.route("design")).body)).not.toContain("#111111");
  });

  test("a second first-save (revision null) also conflicts instead of overwriting", async () => {
    const editor = userWithRole(ROLES.editor);
    await t.route("design/save", { user: editor, body: { design: design(), revision: null } });
    const again = await t.route("design/save", {
      user: editor,
      body: { design: design("#333333"), revision: null },
    });
    expect(again.status).toBe(409);
  });

  test("a design of 256 KiB + 1 byte gets 413, not 500", async () => {
    const big = { ...design(), padding: "" };
    big.padding = "x".repeat(
      MAX_DESIGN_BYTES + 1 - new TextEncoder().encode(JSON.stringify(big)).length,
    );
    expect(new TextEncoder().encode(JSON.stringify(big)).length).toBe(MAX_DESIGN_BYTES + 1);
    const result = await t.route("design/save", {
      user: userWithRole(ROLES.admin),
      body: { design: big, revision: null },
    });
    expect(result.status).toBe(413);
    expect(JSON.stringify(result.body)).toContain("DESIGN_TOO_LARGE");
  });

  test("a design of exactly 256 KiB passes the size check and goes on to validation", async () => {
    const big = { ...design(), padding: "" };
    big.padding = "x".repeat(
      MAX_DESIGN_BYTES - new TextEncoder().encode(JSON.stringify(big)).length,
    );
    expect(new TextEncoder().encode(JSON.stringify(big)).length).toBe(MAX_DESIGN_BYTES);
    const result = await t.route("design/save", {
      user: userWithRole(ROLES.admin),
      body: { design: big, revision: null },
    });
    // The padding key is not part of a design, so validation (422) runs instead of the size limit (413).
    expect(result.status).toBe(422);
    expect(JSON.stringify(result.body)).toContain("INVALID_DESIGN");
  });

  test("an unreadable stored design is served as the empty design, and only its issue code is logged", async () => {
    const errors: unknown[][] = [];
    const ctx = {
      storage: {
        design: {
          getVersioned: async () => ({
            value: { ...design("red;}body{x:y"), secret: "SECRET" },
            revision: "r7",
          }),
        },
      },
      log: { error: (...args: unknown[]) => void errors.push(args) },
    } as never;
    expect(await designRoute.handler(ctx)).toEqual({
      design: {
        schemaVersion: 13,
        variables: { colors: [], fonts: [], fontSizes: [], spacings: [] },
        classes: [],
      },
      revision: "r7",
      status: "unreadable",
    });
    expect(errors).toEqual([["emvb: stored design is unreadable", { code: "invalid_format" }]]);
  });

  test("an invalid design gets 422 with issue paths", async () => {
    const result = await t.route("design/save", {
      user: userWithRole(ROLES.editor),
      body: { design: design("red;}body{x:y"), revision: null },
    });
    expect(result.status).toBe(422);
    expect(JSON.stringify(result.body)).toContain("variables.colors[0].value");
  });

  test("an anonymous save gets 401", async () => {
    expect(
      (await t.route("design/save", { body: { design: design(), revision: null } })).status,
    ).toBe(401);
  });

  test.each([ROLES.subscriber, ROLES.contributor, ROLES.author])(
    "a role-%i save gets 403",
    async (role) => {
      const result = await t.route("design/save", {
        user: userWithRole(role),
        body: { design: design(), revision: null },
      });
      expect(result.status).toBe(403);
      expect(result.body).toMatchObject({ error: { code: "FORBIDDEN" } });
    },
  );

  test("a private request without the CSRF header gets 403 even for an admin", async () => {
    const result = await t.route("design/save", {
      user: userWithRole(ROLES.admin),
      body: { design: design(), revision: null },
      csrf: false,
    });
    expect(result).toMatchObject({ status: 403, body: { error: { code: "CSRF_REJECTED" } } });
  });

  test("health is public", async () => {
    expect(await t.route("health")).toMatchObject({
      status: 200,
      body: { data: { ok: true, plugin: "emvb" } },
    });
  });
});

describe("admin declarations (D-024)", () => {
  test("Visual pages and Theme Builder are declared; the editor stays undeclared", () => {
    expect(createPlugin().admin?.pages).toEqual([
      { path: "/pages", label: "Pages VisualBuilder", icon: "layout" },
      { path: "/theme", label: "Theme Builder", icon: "layout" },
    ]);
  });
});
