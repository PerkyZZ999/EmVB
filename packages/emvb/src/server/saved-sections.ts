import { PluginRouteError, type PluginRoute, type RouteContext } from "emdash";
import { z } from "zod";
import {
  MAX_SAVED_SECTIONS,
  readSavedSection,
  savedSectionName,
  savedSectionRecord,
  SAVED_SECTION_REASONS,
  type SavedSectionRecord,
  type SavedSectionSummary,
} from "../core/index.ts";
import type { SavedSectionsPort } from "../mcp/ports.ts";
import { queued } from "../mcp/queue.ts";

/**
 * Saved sections (W-875, D-060): named copies of an element kept per site in plugin storage
 * `emvb_saved_sections`. Every row read goes through `readSavedSection`, so an old save comes
 * back upgraded and a damaged or hand-written one is never inserted. Writes take the same
 * per-isolate queue as the MCP tools.
 */
const SAVED_SECTIONS_COLLECTION = "emvb_saved_sections";

type SavedSectionStore = {
  get(id: string): Promise<unknown>;
  put(id: string, data: SavedSectionRecord): Promise<void>;
  delete(id: string): Promise<boolean>;
  query(options?: {
    orderBy?: Record<string, "asc" | "desc">;
    limit?: number;
  }): Promise<{ items: Array<{ id: string; data: unknown }>; hasMore: boolean }>;
};

const QUEUE = "saved-sections";
const ID = /^[0-9a-f]{16}$/;
const FULL_REASON = `My sections holds up to ${MAX_SAVED_SECTIONS} sections. Delete one you no longer use, then save again.`;

function summaryOf(id: string, data: unknown): SavedSectionSummary {
  const read = readSavedSection(data);
  if (read.ok) {
    const { name, updatedAt, classes } = read.section;
    return { id, name, updatedAt, classCount: classes.length };
  }
  const raw = (data ?? {}) as { name?: unknown; updatedAt?: unknown };
  return {
    id,
    name: (typeof raw.name === "string" && savedSectionName(raw.name)) || "Damaged section",
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    classCount: 0,
    damaged: true,
  };
}

/** The port the routes and the MCP tools share, on a plugin storage collection. */
function savedSectionsPort(store: SavedSectionStore): SavedSectionsPort {
  const all = () => store.query({ orderBy: { updatedAt: "desc" }, limit: MAX_SAVED_SECTIONS });
  return {
    async list() {
      const page = await all();
      return page.items.map(({ id, data }) => summaryOf(id, data));
    },
    async get(id) {
      if (!ID.test(id)) return null;
      const data = await store.get(id);
      if (data === null || data === undefined) return null;
      const read = readSavedSection(data);
      return read.ok ? read.section : read;
    },
    create: (record) =>
      queued(QUEUE, async () => {
        const read = readSavedSection(record);
        if (!read.ok) return read;
        if ((await all()).items.length >= MAX_SAVED_SECTIONS) {
          return { ok: false as const, reason: FULL_REASON };
        }
        const id = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
        await store.put(id, savedSectionRecord(read.section));
        return { id };
      }),
    rename: (id, rawName) =>
      queued(QUEUE, async () => {
        if (!ID.test(id)) return null;
        const data = await store.get(id);
        if (data === null || data === undefined) return null;
        const name = savedSectionName(rawName);
        if (!name) return { ok: false as const, reason: SAVED_SECTION_REASONS.name };
        const read = readSavedSection(data);
        if (!read.ok) return read;
        const section = { ...read.section, name, updatedAt: new Date().toISOString() };
        await store.put(id, savedSectionRecord(section));
        return summaryOf(id, savedSectionRecord(section));
      }),
    remove: (id) => queued(QUEUE, async () => ID.test(id) && (await store.delete(id))),
  };
}

export const portOf = (ctx: RouteContext<unknown>) =>
  savedSectionsPort(ctx.storage[SAVED_SECTIONS_COLLECTION] as unknown as SavedSectionStore);

const NOT_FOUND = "That section is not in My sections.";
const refusedError = (reason: string) => new PluginRouteError("REFUSED", reason, 422);

/** Editors and above: the saved sections, newest first, by name. */
export const savedSectionsRoute: PluginRoute = {
  permission: "content:edit_any",
  handler: async (ctx) => ({ items: await portOf(ctx).list() }),
};

const IdInput = z.object({ id: z.string().regex(ID, "Unknown section") });

/** Editors and above: one section, read and upgraded, ready for `prepareSavedSection`. */
export const savedSectionGetRoute: PluginRoute<z.infer<typeof IdInput>> = {
  permission: "content:edit_any",
  input: IdInput,
  handler: async (ctx) => {
    const section = await portOf(ctx).get(ctx.input.id);
    if (!section) throw new PluginRouteError("NOT_FOUND", NOT_FOUND, 404);
    if ("ok" in section) throw refusedError(section.reason);
    return { section };
  },
};

/** A record from the editor; the server checks it again, whatever the client did. */
const SaveInput = z.object({ record: z.record(z.string(), z.unknown()) });

export const savedSectionSaveRoute: PluginRoute<z.infer<typeof SaveInput>> = {
  permission: "content:edit_any",
  input: SaveInput,
  handler: async (ctx) => {
    const now = new Date().toISOString();
    const record = { ...ctx.input.record, createdAt: now, updatedAt: now };
    const made = await portOf(ctx).create(record as SavedSectionRecord);
    if ("ok" in made) {
      const full = made.reason === FULL_REASON;
      throw new PluginRouteError(full ? "SECTIONS_FULL" : "REFUSED", made.reason, full ? 409 : 422);
    }
    return { id: made.id };
  },
};

const RenameInput = IdInput.extend({ name: z.string().min(1).max(255) });

export const savedSectionRenameRoute: PluginRoute<z.infer<typeof RenameInput>> = {
  permission: "content:edit_any",
  input: RenameInput,
  handler: async (ctx) => {
    const item = await portOf(ctx).rename(ctx.input.id, ctx.input.name);
    if (!item) throw new PluginRouteError("NOT_FOUND", NOT_FOUND, 404);
    if ("ok" in item) throw refusedError(item.reason);
    return { item };
  },
};

/** Pages that already hold an inserted copy keep it: a copy is not linked to its source. */
export const savedSectionDeleteRoute: PluginRoute<z.infer<typeof IdInput>> = {
  permission: "content:edit_any",
  input: IdInput,
  handler: async (ctx) => {
    if (!(await portOf(ctx).remove(ctx.input.id))) {
      throw new PluginRouteError("NOT_FOUND", NOT_FOUND, 404);
    }
    return { id: ctx.input.id };
  },
};
