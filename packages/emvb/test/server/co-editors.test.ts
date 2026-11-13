import { describe, expect, test } from "bun:test";
import { s1Page } from "../fixtures/layouts.ts";
import { PAGES_COLLECTION, THEME_PARTS_COLLECTION } from "../../src/constants.ts";
import { beforeSave } from "../../src/server/hooks.ts";
import { createPlugin, PLUGIN_META } from "../../src/server/plugin.ts";
import { ROLES } from "./runtime.ts";

// W-991 (S-04): EmDash 1.5 co-editing saves a room's changes as one actor and lists every
// participant in `event.editedBy`. A contributor's layout change must not pass under an editor's
// name. `editedBy` doesn't exist on EmDash 1.4, where the actor alone counts, as before.

const USERS: Record<string, number> = {
  "user-editor": ROLES.editor,
  "user-editor-2": ROLES.editor,
  "user-admin": ROLES.admin,
  "user-contributor": ROLES.contributor,
};
const stored = s1Page();
const changed = { ...s1Page(), root: { ...s1Page().root, children: [] } };

type Options = { editedBy?: unknown; users?: "none" | "throws"; actorRole?: number };
function save(collection: string, content: Record<string, unknown>, options: Options = {}) {
  const lookups: string[] = [];
  const users =
    options.users === "none"
      ? undefined
      : {
          get: async (id: string) => {
            lookups.push(id);
            if (options.users === "throws") throw new Error("users table missing");
            const role = USERS[id];
            return role === undefined ? null : { id, role };
          },
        };
  const ctx = {
    log: { warn: () => undefined },
    ...(users ? { users } : {}),
    schema: {
      getCollection: async () => ({ fields: [{ slug: "canvas", widget: "emvb:canvas" }] }),
    },
    content: { get: async () => ({ data: { canvas: stored } }) },
  } as never;
  const event = {
    collection,
    id: "01ENTRY",
    content,
    isNew: false,
    actor: { id: "user-editor", role: options.actorRole ?? ROLES.editor },
    ...(options.editedBy === undefined ? {} : { editedBy: options.editedBy }),
  } as never;
  const result = beforeSave(event, ctx, ["posts"]).then(
    () => "saved",
    (error: Error) => error.message,
  );
  return { result, lookups };
}

describe("a co-edited save checks every editor in editedBy (W-991, S-04)", () => {
  test("EmDash 1.4 (no editedBy): the actor alone counts, as before", async () => {
    expect(await save(PAGES_COLLECTION, { layout: changed }).result).toBe("saved");
    expect(await save(PAGES_COLLECTION, { layout: changed }, { actorRole: 20 }).result).toContain(
      "Only editors and administrators",
    );
  });

  test("an EmVB page or theme part saved with a contributor in the room is refused", async () => {
    const results = await Promise.all(
      [PAGES_COLLECTION, THEME_PARTS_COLLECTION].map(
        (collection) =>
          save(collection, { layout: changed }, { editedBy: ["user-editor", "user-contributor"] })
            .result,
      ),
    );
    for (const message of results) expect(message).toContain("Only editors and administrators");
  });

  test("editors and admins together save; each one is looked up once", async () => {
    const { result, lookups } = save(
      PAGES_COLLECTION,
      { layout: changed },
      { editedBy: ["user-editor", "user-editor-2", "user-admin", "user-editor-2"] },
    );
    expect(await result).toBe("saved");
    expect(lookups.toSorted()).toEqual(["user-admin", "user-editor-2"]);
  });

  test("an unknown user, a failed lookup, no users access or a malformed list fail closed", async () => {
    const cases: Options[] = [
      { editedBy: ["user-editor", "user-gone"] },
      { editedBy: ["user-editor-2"], users: "throws" },
      { editedBy: ["user-editor-2"], users: "none" },
      { editedBy: "user-contributor" },
      { editedBy: [42] },
    ];
    const results = await Promise.all(
      cases.map((options) => save(PAGES_COLLECTION, { layout: changed }, options).result),
    );
    for (const message of results) expect(message).toContain("Only editors and administrators");
  });

  test("only the actor in editedBy needs no lookup, even without users access", async () => {
    const { result } = save(
      PAGES_COLLECTION,
      { layout: changed },
      { editedBy: ["user-editor"], users: "none" },
    );
    expect(await result).toBe("saved");
  });

  test("a canvas field: a contributor in the room can't change it, but the rest saves", async () => {
    const room = { editedBy: ["user-editor", "user-contributor"] };
    expect(await save("posts", { title: "x", canvas: changed }, room).result).toContain(
      "Only editors and administrators can change an EmVB layout",
    );
    expect(await save("posts", { title: "x", canvas: stored }, room).result).toBe("saved");
    expect(
      await save("posts", { title: "x", canvas: changed }, { editedBy: ["user-editor-2"] }).result,
    ).toBe("saved");
  });
});

test("the plugin asks EmDash for users:read, which co-edited saves need (W-991)", () => {
  const capabilities = (createPlugin() as unknown as { capabilities: string[] }).capabilities;
  expect(capabilities.includes("users:read")).toBe(true);
});

test("W-1005: EmVB names and describes itself for EmDash's plugins screen", () => {
  expect(PLUGIN_META).toEqual({
    displayName: "EmVB",
    description:
      "Visual page builder: pages, theme parts and site styles, edited on a live canvas.",
  });
});

test("W-1005: EmDash 1.5 gets EmVB's name and description; 1.4 ignores them", async () => {
  const { version } = (await import("emdash/package.json", { with: { type: "json" } })).default as {
    version: string;
  };
  const plugin = createPlugin() as unknown as { displayName?: string; description?: string };
  if (Bun.semver.satisfies(version, ">=1.5.0")) {
    expect(plugin.displayName).toBe("EmVB");
    expect(plugin.description).toContain("Visual page builder");
  } else {
    expect(plugin.displayName).toBeUndefined();
  }
});
