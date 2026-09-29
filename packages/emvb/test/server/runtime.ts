import { SchemaRegistry } from "emdash";
import { createDialect } from "emdash/db/sqlite";
// EmDash 1.0 moved the test runtime under `emdash/internal/` (upgrade guide). `@emdash-cms/plugin-test`
// is the public harness but is workerd-backed for sandboxed plugins; EmVB is a native plugin and needs
// the in-process runtime that package is built on.
import {
  EmDashRuntime,
  dispatchPluginApiRequest,
  type UserInfo,
} from "emdash/internal/plugin-test-runtime";
import { PAGES_COLLECTION, PLUGIN_ID } from "../../src/constants.ts";
import { createPlugin } from "../../src/server/plugin.ts";

export const ROLES = {
  subscriber: 10,
  contributor: 20,
  author: 30,
  editor: 40,
  admin: 50,
} as const;

export const userWithRole = (role: number): UserInfo => ({
  id: `user-${role}`,
  email: `role${role}@example.test`,
  name: `Role ${role}`,
  role,
  createdAt: "2026-09-26T00:00:00.000Z",
});

/** A real EmDash runtime on in-memory SQLite with EmVB installed and the pages collection created. */
export async function createTestRuntime() {
  const runtime = await EmDashRuntime.create({
    // The runtime caches its database per entrypoint, so each test runtime gets its own.
    config: {
      database: { entrypoint: `emvb-test-${crypto.randomUUID()}`, config: {}, type: "sqlite" },
    },
    plugins: [createPlugin()],
    createDialect: () => createDialect({ url: ":memory:" }),
    createStorage: null,
    sandboxEnabled: false,
    sandboxedPluginEntries: [],
    createSandboxRunner: null,
  } as unknown as Parameters<typeof EmDashRuntime.create>[0]);
  const schema = new SchemaRegistry(runtime.db);
  await schema.createCollection({
    slug: PAGES_COLLECTION,
    label: "Visual pages",
    hidden: true,
    supports: ["drafts", "revisions"],
  });
  await schema.createField(PAGES_COLLECTION, { slug: "title", label: "Title", type: "string" });
  await schema.createField(PAGES_COLLECTION, { slug: "layout", label: "Layout", type: "json" });

  const route = async (
    path: string,
    init: { user?: UserInfo; body?: unknown; csrf?: boolean } = {},
  ) => {
    const request = new Request(`http://localhost/_emdash/api/plugins/${PLUGIN_ID}/${path}`, {
      method: init.body === undefined ? "GET" : "POST",
      headers: {
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        // The admin client sends this on every private request (CSRF guard).
        ...(init.csrf === false ? {} : { "X-EmDash-Request": "1" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const response = await dispatchPluginApiRequest({
      runtime,
      pluginId: PLUGIN_ID,
      path: `/${path}`,
      request,
      user: init.user ?? null,
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };

  const savePage = (data: Record<string, unknown>, role: number | undefined = ROLES.editor) =>
    runtime.handleContentCreate(PAGES_COLLECTION, {
      data,
      ...(role === undefined ? {} : { actor: { id: `user-${role}`, role } }),
    });

  return { runtime, route, savePage, dispose: () => runtime.shutdown() };
}
