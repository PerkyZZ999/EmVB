import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { layoutOfBytes, s1Page } from "../fixtures/layouts.ts";
import { MAX_DESIGN_BYTES, MAX_LAYOUT_BYTES } from "../../src/core/index.ts";
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
            schemaVersion: 1,
            variables: { colors: [], fonts: [], fontSizes: [], spacings: [] },
          },
          revision: null,
          status: "empty",
        },
      },
    });
  });

  test("an editor saves with CAS, and the public route returns the new revision", async () => {
    const editor = userWithRole(ROLES.editor);
    const first = await t.route("design/save", {
      user: editor,
      body: { design: design(), revision: null },
    });
    expect(first.status).toBe(200);
    const revision = (first.body["data"] as { revision: string }).revision;
    const read = await t.route("design");
    expect(read.body["data"]).toEqual({ design: design(), revision, status: "ok" });
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
    expect(JSON.stringify((await t.route("design")).body)).toContain("#111111");
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
  test("only Visual pages is declared, so the editor never gets a sidebar or palette entry", () => {
    expect(createPlugin().admin?.pages).toEqual([
      { path: "/pages", label: "Visual pages", icon: "layout" },
    ]);
  });
});
