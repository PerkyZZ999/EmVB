import {
  byteLength,
  emptyDesign,
  MAX_DESIGN_BYTES,
  nestingIssues,
  prepareUploadedSvg,
  summarizeIssues,
  UPLOAD_SVG_MAX_BYTES,
  validateConditions,
  validateDesign,
  validateFloatSettings,
  validateLayout,
  validateTriggers,
  type DesignSystem,
  type UploadedIconItem,
} from "../../../../packages/emvb/src/core/index.ts";
import {
  EDITOR_ROLE,
  PAGES_COLLECTION,
  PLUGIN_ID,
  THEME_PARTS_COLLECTION,
} from "../../../../packages/emvb/src/constants.ts";
import type { Fetcher } from "../../../../packages/emvb/src/admin/api.ts";
import type { MediaLibraryItem } from "../../../../packages/emvb/src/admin/media-api.ts";
import {
  journalLayout,
  landingLayout,
  mediaUrl,
  SEED_DESIGN,
  SEED_FORM,
  SEED_MEDIA,
} from "./seed.ts";

/**
 * The playground's stand-in for EmDash: the same HTTP routes the EmVB editor calls, answered in
 * the browser from one state object that is saved to localStorage after every change. The editor
 * gets it as its `Fetcher`, so none of the editor's own code knows it isn't talking to a server.
 */

export const STORAGE_KEY = "emvb-playground:v1";
const STATE_VERSION = 1;

/** One upload may be this big; the whole media library this big (localStorage is ~5 MB). */
export const MEDIA_FILE_MAX_BYTES = 750 * 1024;
export const MEDIA_TOTAL_MAX_BYTES = 2.5 * 1024 * 1024;

/** Where the editor's Preview and "View page" open: the playground's own renderer page. */
export const VIEW_PATH = "/playground/view/";

export type EntryContent = {
  slug: string;
  data: Record<string, unknown>;
  seo: { title: string | null; description: string | null };
};

export type StoredEntry = {
  id: string;
  collection: string;
  status: "draft" | "published";
  /** The working copy: what the editor loads and saves. */
  draft: EntryContent;
  /** What a visitor sees; null until the first publish. */
  published: EntryContent | null;
  /** Set while a published entry has saved changes on top (EmDash's draft revision). */
  draftRevisionId: string | null;
  rev: number;
  createdAt: string;
  updatedAt: string;
};

type Versioned<T> = { value: T; revision: string } | null;

export type StoredMedia = MediaLibraryItem & { uploadedAt: string };

export type PlaygroundState = {
  version: number;
  seq: number;
  entries: StoredEntry[];
  design: { draft: Versioned<DesignSystem>; published: Versioned<DesignSystem> };
  icons: UploadedIconItem[];
  media: StoredMedia[];
};

/** The parts of `Storage` the backend uses, so tests can pass a plain object. */
export type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type BackendOptions = {
  storage?: KeyValueStore | null;
  now?: () => Date;
  /** Milliseconds each answer waits, so saving feels like saving. Tests use 0. */
  latency?: number;
};

const copy = <T>(value: T): T => structuredClone(value);

export function seedState(now: Date = new Date()): PlaygroundState {
  const at = now.toISOString();
  const earlier = new Date(now.getTime() - 60_000).toISOString();
  const landing: EntryContent = {
    slug: "fieldnote",
    data: { title: "Fieldnote landing page", layout: landingLayout(), canvas_mode: "blank" },
    seo: {
      title: "Fieldnote · notes your whole team will read",
      description: "A made-up landing page built with EmVB.",
    },
  };
  const journal: EntryContent = {
    slug: "journal",
    data: { title: "Journal", layout: journalLayout(), canvas_mode: "blank" },
    seo: { title: null, description: null },
  };
  return {
    version: STATE_VERSION,
    seq: 100,
    entries: [
      {
        id: "page-landing",
        collection: PAGES_COLLECTION,
        status: "published",
        draft: copy(landing),
        published: copy(landing),
        draftRevisionId: null,
        rev: 1,
        createdAt: earlier,
        updatedAt: at,
      },
      {
        id: "page-journal",
        collection: PAGES_COLLECTION,
        status: "draft",
        draft: journal,
        published: null,
        draftRevisionId: null,
        rev: 1,
        createdAt: earlier,
        updatedAt: earlier,
      },
    ],
    design: {
      draft: { value: copy(SEED_DESIGN), revision: "design-1" },
      published: { value: copy(SEED_DESIGN), revision: "design-1" },
    },
    icons: [],
    media: SEED_MEDIA.map((item): StoredMedia =>
      Object.assign(structuredClone(item), {
        storageKey: item.filename,
        status: "ready",
        url: mediaUrl(item.filename),
        uploadedAt: earlier,
      }),
    ),
  };
}

/** Saved state when it is ours and readable; otherwise null (a fresh seed is used). */
export function readState(storage: KeyValueStore | null | undefined): PlaygroundState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlaygroundState>;
    if (parsed.version !== STATE_VERSION || !Array.isArray(parsed.entries)) return null;
    return parsed as PlaygroundState;
  } catch {
    return null;
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const ok = (data: unknown) => json(200, { success: true, data });

const notFound = (message = "Not found") => new HttpError(404, "NOT_FOUND", message);

const OWNED = new Set([PAGES_COLLECTION, THEME_PARTS_COLLECTION]);

const parseJsonField = (raw: unknown) => {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
};

/** EmVB's own `content:beforeSave` checks, as the server runs them (R-006, R-061, W-225). */
function checkContent(collection: string, data: Record<string, unknown>): Record<string, unknown> {
  const kind = collection === THEME_PARTS_COLLECTION ? "theme part" : "page";
  const next = { ...data };
  if (data["layout"] !== undefined && data["layout"] !== null) {
    const result = validateLayout(parseJsonField(data["layout"]));
    if (!result.ok) {
      throw new HttpError(
        422,
        "CONTENT_REJECTED",
        `The ${kind} layout is invalid. ${summarizeIssues(result.issues)}`,
      );
    }
    const misplaced = nestingIssues(result.layout, 3);
    if (misplaced.length > 0) {
      throw new HttpError(
        422,
        "CONTENT_REJECTED",
        `The ${kind} layout has elements in the wrong place. ${misplaced
          .map((issue) => issue.message)
          .join("; ")}`,
      );
    }
    next["layout"] = result.layout;
  }
  if (collection === THEME_PARTS_COLLECTION) {
    const checks: [string, (raw: unknown) => { ok: boolean }][] = [
      ["conditions", validateConditions],
      ["triggers", validateTriggers],
      ["float", validateFloatSettings],
    ];
    for (const [field, check] of checks) {
      if (data[field] === undefined) continue;
      if (!check(parseJsonField(data[field])).ok) {
        throw new HttpError(422, "CONTENT_REJECTED", `The theme part ${field} are invalid.`);
      }
    }
  }
  return next;
}

type Route = {
  method: string;
  segments: string[];
  query: URLSearchParams;
  body: unknown;
  form: FormData | null;
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const checkRev = (entry: StoredEntry, rev: unknown) => {
  if (typeof rev === "string" && rev !== revOf(entry)) {
    throw new HttpError(409, "CONFLICT", "This item was changed somewhere else. Reload it.");
  }
};

const revOf = (entry: StoredEntry) => `${entry.id}:${entry.rev}`;

const itemOf = (entry: StoredEntry) => ({
  id: entry.id,
  type: entry.collection,
  slug: entry.draft.slug,
  status: entry.status,
  draftRevisionId: entry.draftRevisionId,
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
  publishedAt: entry.published ? entry.updatedAt : null,
  data: copy(entry.draft.data),
  seo: copy(entry.draft.seo),
});

const mediaItem = ({ uploadedAt: _at, ...item }: StoredMedia): MediaLibraryItem => item;

const forms = (r: Route) => {
  const action = r.segments.slice(3).join("/");
  if (action === "forms/list" && r.method === "POST") {
    return { items: [{ id: SEED_FORM.id, name: SEED_FORM.name, slug: SEED_FORM.slug }] };
  }
  if (action === "definition" && r.method === "POST") {
    const body = (r.body ?? {}) as { id?: unknown };
    if (body.id !== SEED_FORM.id) throw notFound("Form not found");
    return copy(SEED_FORM);
  }
  if (action === "submit" && r.method === "POST") {
    return { demo: true, message: "Demo only: nothing was sent." };
  }
  throw notFound("Plugin route not found");
};

const collections = (r: Route) => {
  const slug = r.segments[3] ?? "";
  if (!OWNED.has(slug) || r.method !== "GET") throw notFound("Collection not found");
  return {
    item: {
      slug,
      hidden: slug === THEME_PARTS_COLLECTION,
      supports: ["drafts", "revisions"],
      hasSeo: slug === PAGES_COLLECTION,
      urlPattern: slug === PAGES_COLLECTION ? `${VIEW_PATH}?slug={slug}` : null,
      fields: [],
    },
  };
};

export type PlaygroundBackend = {
  fetcher: Fetcher;
  /** The current state (a copy). */
  snapshot: () => PlaygroundState;
  /** Back to the starter content, in memory and in storage. */
  reset: () => void;
  /** Called after every change that was saved. */
  subscribe: (listener: () => void) => () => void;
};

export function createBackend(options: BackendOptions = {}): PlaygroundBackend {
  const storage = options.storage ?? null;
  const now = options.now ?? (() => new Date());
  const latency = options.latency ?? 0;
  let state: PlaygroundState = readState(storage) ?? seedState(now());
  const listeners = new Set<() => void>();

  const persist = () => {
    if (!storage) return;
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  };

  /** Runs a change; when the browser refuses to store the result, the change is undone. */
  const mutate = <T>(change: () => T): T => {
    const before = copy(state);
    const result = change();
    try {
      persist();
    } catch {
      state = before;
      throw new HttpError(
        507,
        "STORAGE_FULL",
        "This browser's storage for the playground is full. Remove an uploaded image, or use Reset.",
      );
    }
    for (const listener of listeners) listener();
    return result;
  };

  const nextId = (prefix: string) => {
    state.seq += 1;
    return `${prefix}-${state.seq.toString(36)}${Math.floor(Math.random() * 1296)
      .toString(36)
      .padStart(2, "0")}`;
  };

  const findEntry = (collection: string, id: string) => {
    const entry = state.entries.find((e) => e.collection === collection && e.id === id);
    if (!entry) throw notFound("Content item not found");
    return entry;
  };

  const slugTaken = (collection: string, slug: string, except?: string) =>
    slug !== "" &&
    state.entries.some(
      (e) => e.collection === collection && e.id !== except && e.draft.slug === slug,
    );

  const readSlug = (collection: string, raw: unknown, except?: string) => {
    const slug = typeof raw === "string" ? raw.trim() : "";
    if (slug && !SLUG.test(slug)) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "Slugs use lowercase letters, digits and dashes.",
      );
    }
    if (slugTaken(collection, slug, except)) {
      throw new HttpError(409, "SLUG_CONFLICT", `The slug "${slug}" is already taken.`);
    }
    return slug;
  };

  const content = (r: Route) => {
    const [, , collection = "", id, action] = r.segments;
    if (!OWNED.has(collection)) throw notFound("Collection not found");
    const body = (r.body ?? {}) as {
      data?: Record<string, unknown>;
      slug?: unknown;
      seo?: { title?: string | null; description?: string | null };
      [key: string]: unknown;
    };
    if (!id) {
      if (r.method === "GET") {
        const limit = Math.min(100, Number(r.query.get("limit") ?? 50) || 50);
        const offset = Number(r.query.get("cursor") ?? 0) || 0;
        const all = state.entries
          .filter((e) => e.collection === collection)
          .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        const items = all.slice(offset, offset + limit).map(itemOf);
        const more = offset + limit < all.length;
        return { items, ...(more ? { nextCursor: String(offset + limit) } : {}) };
      }
      if (r.method === "POST") {
        return mutate(() => {
          const data = checkContent(collection, body.data ?? {});
          const slug = readSlug(collection, body.slug);
          const at = now().toISOString();
          const entry: StoredEntry = {
            id: nextId(collection === PAGES_COLLECTION ? "page" : "part"),
            collection,
            status: "draft",
            draft: { slug, data, seo: { title: null, description: null } },
            published: null,
            draftRevisionId: null,
            rev: 1,
            createdAt: at,
            updatedAt: at,
          };
          state.entries.push(entry);
          return { item: itemOf(entry), _rev: revOf(entry) };
        });
      }
    }
    if (id && !action) {
      const entry = findEntry(collection, decodeURIComponent(id));
      if (r.method === "GET") return { item: itemOf(entry), _rev: revOf(entry) };
      if (r.method === "PUT") {
        return mutate(() => {
          checkRev(entry, body["_rev"]);
          const data = checkContent(collection, { ...entry.draft.data, ...body.data });
          const slug =
            body.slug === undefined ? entry.draft.slug : readSlug(collection, body.slug, entry.id);
          entry.draft = {
            slug,
            data,
            seo: {
              title: body.seo?.title ?? (body.seo ? null : entry.draft.seo.title),
              description: body.seo?.description ?? (body.seo ? null : entry.draft.seo.description),
            },
          };
          entry.rev += 1;
          entry.updatedAt = now().toISOString();
          if (entry.status === "published") entry.draftRevisionId = `draft-${entry.rev}`;
          return { item: itemOf(entry), _rev: revOf(entry) };
        });
      }
      if (r.method === "DELETE") {
        return mutate(() => {
          state.entries = state.entries.filter((e) => e !== entry);
          return {};
        });
      }
    }
    if (id && action && r.method === "POST") {
      const entry = findEntry(collection, decodeURIComponent(id));
      if (action === "publish") {
        return mutate(() => {
          checkRev(entry, body["_rev"]);
          entry.published = copy(entry.draft);
          entry.status = "published";
          entry.draftRevisionId = null;
          entry.rev += 1;
          entry.updatedAt = now().toISOString();
          return { item: itemOf(entry), _rev: revOf(entry) };
        });
      }
      if (action === "discard-draft") {
        return mutate(() => {
          checkRev(entry, body["_rev"]);
          if (!entry.published) {
            throw new HttpError(409, "NO_PUBLISHED_VERSION", "This item was never published.");
          }
          entry.draft = copy(entry.published);
          entry.draftRevisionId = null;
          entry.rev += 1;
          entry.updatedAt = now().toISOString();
          return { item: itemOf(entry), _rev: revOf(entry) };
        });
      }
      if (action === "preview-url") {
        return { url: `${VIEW_PATH}?${new URLSearchParams({ entry: entry.id, draft: "1" })}` };
      }
    }
    throw notFound();
  };

  const readDesign = (which: "draft" | "published") => {
    const current = state.design[which];
    if (!current) return { design: emptyDesign(), revision: null as string | null, ok: false };
    const result = validateDesign(current.value);
    return result.ok
      ? { design: result.design, revision: current.revision, ok: true }
      : { design: emptyDesign(), revision: current.revision, ok: false };
  };

  const design = (r: Route) => {
    const action = r.segments[4];
    if (!action && r.method === "GET") {
      const published = readDesign("published");
      return { design: published.design, revision: published.revision, status: "ok" };
    }
    if (action === "draft" && r.method === "GET") {
      const published = readDesign("published");
      const draft = readDesign("draft");
      if (!draft.ok) {
        return {
          design: published.design,
          revision: null,
          publishedRevision: published.revision,
          unpublished: false,
        };
      }
      return {
        design: draft.design,
        revision: draft.revision,
        publishedRevision: published.revision,
        unpublished: JSON.stringify(draft.design) !== JSON.stringify(published.design),
      };
    }
    if (action === "save" && r.method === "POST") {
      const body = (r.body ?? {}) as { design?: unknown; revision?: string | null };
      const bytes = byteLength(body.design);
      if (bytes > MAX_DESIGN_BYTES) {
        throw new HttpError(
          413,
          "DESIGN_TOO_LARGE",
          `The design system is ${bytes} bytes; the limit is ${MAX_DESIGN_BYTES}.`,
        );
      }
      const result = validateDesign(body.design);
      if (!result.ok) {
        throw new HttpError(
          422,
          "INVALID_DESIGN",
          `The design system is invalid. ${summarizeIssues(result.issues)}`,
        );
      }
      return mutate(() => {
        const current = state.design.draft?.revision ?? null;
        if ((body.revision ?? null) !== current) {
          throw new HttpError(
            409,
            "CONFLICT",
            "The design system was changed somewhere else. Reload it and try again.",
          );
        }
        const revision = nextId("design");
        state.design.draft = { value: result.design, revision };
        return { revision };
      });
    }
    if (action === "publish" && r.method === "POST") {
      const body = (r.body ?? {}) as { publishedRevision?: string | null };
      return mutate(() => {
        const draft = readDesign("draft");
        if (!draft.ok) {
          throw new HttpError(409, "NO_STYLE_DRAFT", "There are no style changes to publish.");
        }
        if ((body.publishedRevision ?? null) !== (state.design.published?.revision ?? null)) {
          throw new HttpError(
            409,
            "CONFLICT",
            "Site styles were published somewhere else. Reload the editor and try again.",
          );
        }
        const revision = nextId("published");
        state.design.published = { value: draft.design, revision };
        return { revision };
      });
    }
    throw notFound("Plugin route not found");
  };

  const icons = (r: Route) => {
    const action = r.segments[4];
    if (!action && r.method === "GET") {
      return { items: state.icons.toSorted((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)) };
    }
    if (action === "upload" && r.method === "POST") {
      const body = (r.body ?? {}) as { name?: unknown; svg?: unknown };
      const svg = typeof body.svg === "string" ? body.svg : "";
      if (!svg || svg.length > UPLOAD_SVG_MAX_BYTES) {
        throw new HttpError(400, "VALIDATION_ERROR", "Upload an SVG up to 32 KB.");
      }
      const prepared = prepareUploadedSvg(svg);
      if (!prepared.ok) throw new HttpError(422, "INVALID_SVG", prepared.message);
      const name =
        String(body.name ?? "")
          .replace(/^.*[\\/]/, "")
          .replace(/\.svg$/i, "")
          .trim()
          .slice(0, 80) || "Uploaded icon";
      return mutate(() => {
        const item: UploadedIconItem = {
          id: nextId("icon"),
          name,
          svg: prepared.svg,
          uploadedAt: now().toISOString(),
        };
        state.icons.push(item);
        return { item, imagesLeftOut: prepared.imagesLeftOut };
      });
    }
    throw notFound("Plugin route not found");
  };

  const media = async (r: Route) => {
    if (r.method === "GET") {
      const type = r.query.get("mimeType") ?? "";
      const q = (r.query.get("q") ?? "").toLowerCase();
      const limit = Number(r.query.get("limit") ?? 50) || 50;
      const items = state.media
        .filter((m) => m.mimeType.startsWith(type))
        .filter(
          (m) => !q || m.filename.toLowerCase().includes(q) || m.alt?.toLowerCase().includes(q),
        )
        .toSorted((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
        .slice(0, limit)
        .map(mediaItem);
      return { items };
    }
    if (r.method === "POST") {
      const file = r.form?.get("file");
      if (!file || typeof file === "string") {
        throw new HttpError(400, "VALIDATION_ERROR", "Choose a file to upload.");
      }
      if (!/^image\/(png|jpeg|gif|webp|avif)$/.test(file.type)) {
        throw new HttpError(
          415,
          "UNSUPPORTED_MEDIA_TYPE",
          "The playground takes PNG, JPEG, GIF, WebP or AVIF images.",
        );
      }
      if (file.size > MEDIA_FILE_MAX_BYTES) {
        throw new HttpError(
          413,
          "PAYLOAD_TOO_LARGE",
          `The playground keeps uploads in this browser, so images are limited to ${
            MEDIA_FILE_MAX_BYTES / 1024
          } KB. This one is ${Math.ceil(file.size / 1024)} KB: try a smaller image or paste an image URL.`,
        );
      }
      const used = state.media.reduce(
        (sum, m) => sum + (m.url.startsWith("data:") ? (m.size ?? 0) : 0),
        0,
      );
      if (used + file.size > MEDIA_TOTAL_MAX_BYTES) {
        throw new HttpError(
          413,
          "PAYLOAD_TOO_LARGE",
          "The playground's uploads in this browser are full (2.5 MB). Use Reset to clear them, or paste an image URL.",
        );
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      const url = `data:${file.type};base64,${btoa(binary)}`;
      const number = (key: string) => {
        const value = Number(r.form?.get(key));
        return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
      };
      const alt = r.form?.get("alt");
      return mutate(() => {
        const item: StoredMedia = {
          id: nextId("media"),
          filename: file.name || "upload",
          mimeType: file.type,
          size: file.size,
          width: number("width"),
          height: number("height"),
          alt: typeof alt === "string" && alt ? alt : null,
          storageKey: `playground/${file.name}`,
          status: "ready",
          url,
          uploadedAt: now().toISOString(),
        };
        state.media.push(item);
        return { item: mediaItem(item) };
      });
    }
    throw notFound();
  };

  const route = async (r: Route): Promise<unknown> => {
    const [api, area, sub, plugin] = r.segments;
    if (api !== "api") throw notFound();
    if (area === "auth" && sub === "me") return { id: "playground", role: EDITOR_ROLE + 10 };
    if (area === "content") return content(r);
    if (area === "media" && !sub) return media(r);
    if (area === "schema" && sub === "collections") return collections(r);
    if (area === "plugins" && sub === PLUGIN_ID && plugin === "design") return design(r);
    if (area === "plugins" && sub === PLUGIN_ID && plugin === "icons") return icons(r);
    if (area === "plugins" && sub === "emdash-forms") return forms(r);
    throw notFound("Plugin route not found");
  };

  const fetcher: Fetcher = async (path, init) => {
    if (latency > 0) await new Promise((resolve) => setTimeout(resolve, latency));
    const url = new URL(path, "https://playground.invalid");
    const prefix = "/_emdash/";
    if (!url.pathname.startsWith(prefix))
      return json(404, { error: { code: "NOT_FOUND", message: "Not found" } });
    const segments = url.pathname.slice(prefix.length).split("/").filter(Boolean);
    let body: unknown;
    let form: FormData | null = null;
    if (init?.body instanceof FormData) form = init.body;
    else if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body) as unknown;
      } catch {
        return json(400, {
          error: { code: "INVALID_JSON", message: "The request body isn't JSON." },
        });
      }
    }
    try {
      const data = await route({
        method: (init?.method ?? "GET").toUpperCase(),
        segments,
        query: url.searchParams,
        body,
        form,
      });
      return ok(data);
    } catch (error) {
      if (error instanceof HttpError) {
        return json(error.status, {
          success: false,
          error: { code: error.code, message: error.message },
        });
      }
      return json(500, {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  };

  return {
    fetcher,
    snapshot: () => copy(state),
    reset: () => {
      state = seedState(now());
      try {
        storage?.removeItem(STORAGE_KEY);
        persist();
      } catch {
        // A full or blocked storage still leaves the fresh state in memory.
      }
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
