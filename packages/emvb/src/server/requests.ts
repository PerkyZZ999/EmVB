import { PluginRouteError, type PluginRoute, type RouteContext } from "emdash";
import { z } from "zod";
import { MAX_OPEN_REQUESTS_PER_PAGE, MAX_REQUEST_PROMPT } from "../core/limits.ts";
import { ProposalTarget } from "../core/proposals.ts";
import { isRecord } from "../core/record.ts";
import type { AgentRequest, RequestsPort } from "../mcp/ports.ts";
import { queued } from "../mcp/queue.ts";
import { isEmvbTarget } from "./targets.ts";

/**
 * W-931 prompt relay (D-063: bring-your-own agent). A person writes a request in the editor's
 * Agent tab; their own agent reads it with get_requests and answers with propose_changes. Nothing
 * here calls a model or holds a key. Requests are the person's words for their agent: they are
 * shown back as plain text and never reach a page.
 *
 * W-990 (S-01): a request is private to its author. Only an agent signed in as that person (its
 * token) reads it, answers it or sees it listed; a row without an author goes to nobody. Any
 * editor's text reached whoever ran `emvb-mcp watch` before, as if they had written it.
 */

const COLLECTION = "emvb_requests";
const ID = /^[0-9a-f]{16}$/;
/** Requests older than this are no longer offered to agents. */
const REQUEST_TTL_MS = 24 * 3_600_000;
const SEEN_KEY = "relay:seen";
/** S-09 (W-998): open requests one person may have across the site. */
const MAX_OPEN_REQUESTS_PER_USER = 20;
/** Expired requests deleted per new request. */
const PURGE_BATCH = 50;
/** EmDash's admin role: may cancel anyone's request. */
const ADMIN_ROLE = 50;

type Target = z.infer<typeof ProposalTarget>;
type Stored = {
  target: Target;
  prompt: string;
  createdAt: string;
  /** The author; a row without one (written before W-990 by a signed-out call) goes to nobody. */
  userId: string | null;
  status: "open" | "answered";
  proposalId?: string;
  answeredAt?: string;
};
type Store = {
  get(id: string): Promise<unknown>;
  put(id: string, data: Stored): Promise<void>;
  delete(id: string): Promise<boolean>;
  query(options: { orderBy: Record<string, "asc" | "desc">; limit: number }): Promise<{
    items: { id: string; data: unknown }[];
  }>;
};
type Kv = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
};

function read(raw: unknown): Stored | null {
  if (!isRecord(raw) || !isRecord(raw.target)) return null;
  const target = ProposalTarget.safeParse(raw.target);
  if (
    !target.success ||
    typeof raw.prompt !== "string" ||
    typeof raw.createdAt !== "string" ||
    (raw.status !== "open" && raw.status !== "answered")
  )
    return null;
  return raw as Stored;
}

const toRequest = (id: string, s: Stored): AgentRequest => ({
  id,
  target: s.target,
  prompt: s.prompt,
  createdAt: s.createdAt,
  status: s.status,
  ...(s.proposalId ? { proposalId: s.proposalId } : {}),
});

/** Two requests in the same millisecond kept no order; times only move forward in one process. */
let lastCreatedMs = 0;
const nextCreatedAt = (nowMs: number) => {
  // A tie (or a slightly earlier clock) moves one millisecond on; a clock far behind is kept.
  lastCreatedMs =
    nowMs > lastCreatedMs || lastCreatedMs - nowMs >= 1000 ? nowMs : lastCreatedMs + 1;
  return new Date(lastCreatedMs).toISOString();
};

const sameTarget = (a: Target, b: Target) => a.collection === b.collection && a.id === b.id;
const ownedBy = (s: Stored, userId: string | null) => userId !== null && s.userId === userId;

/** Same per-isolate write queue pattern as proposals; `now` is injectable for tests. */
export function requestsPort(store: Store, kv: Kv, now: () => number = Date.now): RequestsPort {
  const all = async () => {
    const rows = await store.query({ orderBy: { createdAt: "desc" }, limit: 200 });
    const out: { id: string; stored: Stored }[] = [];
    for (const row of rows.items) {
      const stored = read(row.data);
      if (stored) out.push({ id: row.id, stored });
    }
    return out;
  };
  const live = (s: Stored) => now() - Date.parse(s.createdAt) < REQUEST_TTL_MS;
  return {
    async list(target, userId) {
      return (await all())
        .filter((r) => ownedBy(r.stored, userId) && sameTarget(r.stored.target, target))
        .map((r) => toRequest(r.id, r.stored));
    },
    async open(userId, target) {
      return (await all())
        .filter((r) => r.stored.status === "open" && live(r.stored) && ownedBy(r.stored, userId))
        .filter((r) => !target || sameTarget(r.stored.target, target))
        .map((r) => toRequest(r.id, r.stored))
        .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    create: (target, prompt, userId) =>
      queued("requests", async () => {
        const text = prompt.trim();
        if (!text) return { ok: false as const, reason: "Write what you'd like the agent to do." };
        if (text.length > MAX_REQUEST_PROMPT)
          return {
            ok: false as const,
            reason: `Keep a request under ${MAX_REQUEST_PROMPT} characters.`,
          };
        if (userId === null)
          return { ok: false as const, reason: "Sign in to write a request for your agent." };
        const rows = await all();
        // S-09 (W-998): expired requests are deleted as new ones come in, a few at a time.
        const expired = rows.filter((r) => !live(r.stored)).slice(0, PURGE_BATCH);
        await Promise.all(expired.map((r) => store.delete(r.id)));
        const mine = rows.filter(
          (r) => r.stored.status === "open" && live(r.stored) && ownedBy(r.stored, userId),
        );
        if (mine.length >= MAX_OPEN_REQUESTS_PER_USER)
          return {
            ok: false as const,
            reason: `You already have ${MAX_OPEN_REQUESTS_PER_USER} requests waiting. Cancel one or wait for answers.`,
          };
        const open = rows.filter(
          (r) =>
            r.stored.status === "open" &&
            live(r.stored) &&
            ownedBy(r.stored, userId) &&
            sameTarget(r.stored.target, target),
        );
        if (open.length >= MAX_OPEN_REQUESTS_PER_PAGE)
          return {
            ok: false as const,
            reason: `This page already has ${MAX_OPEN_REQUESTS_PER_PAGE} requests waiting. Cancel one or wait for an answer.`,
          };
        const id = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
        const stored: Stored = {
          target,
          prompt: text,
          createdAt: nextCreatedAt(now()),
          userId,
          status: "open",
        };
        await store.put(id, stored);
        return { ok: true as const, request: toRequest(id, stored) };
      }),
    cancel: (id, userId, isAdmin) =>
      queued("requests", async () => {
        if (!ID.test(id)) return false;
        const stored = read(await store.get(id));
        // S-01: the author or an admin; anyone else sees no such request.
        if (!stored || !(isAdmin || ownedBy(stored, userId))) return false;
        return store.delete(id);
      }),
    answer: (id, target, proposalId, userId) =>
      queued("requests", async () => {
        if (!ID.test(id)) return false;
        const stored = read(await store.get(id));
        if (
          !stored ||
          stored.status !== "open" ||
          !ownedBy(stored, userId) ||
          !sameTarget(stored.target, target)
        )
          return false;
        await store.put(id, {
          ...stored,
          status: "answered",
          proposalId,
          answeredAt: new Date(now()).toISOString(),
        });
        return true;
      }),
    async seen() {
      await kv.set(SEEN_KEY, new Date(now()).toISOString());
    },
    async lastSeen() {
      const at = await kv.get<unknown>(SEEN_KEY);
      return typeof at === "string" && Number.isFinite(Date.parse(at)) ? at : null;
    },
  };
}

export const requestsPortOf = (ctx: RouteContext<unknown>): RequestsPort =>
  requestsPort(ctx.storage[COLLECTION] as unknown as Store, ctx.kv as unknown as Kv);

/** The editor's list: this page's requests and when an agent last checked for requests. */
export const requestsRoute: PluginRoute<z.infer<typeof ProposalTarget>> = {
  permission: "content:edit_any",
  input: ProposalTarget,
  handler: async (ctx) => {
    const port = requestsPortOf(ctx);
    return {
      items: await port.list(ctx.input, ctx.user?.id ?? null),
      agentSeenAt: await port.lastSeen(),
    };
  },
};

const CreateInput = z.strictObject({
  target: ProposalTarget,
  prompt: z.string().max(MAX_REQUEST_PROMPT * 2),
});
export const requestCreateRoute: PluginRoute<z.infer<typeof CreateInput>> = {
  permission: "content:edit_any",
  input: CreateInput,
  handler: async (ctx) => {
    if (!(await isEmvbTarget(ctx, ctx.input.target)))
      throw new PluginRouteError("NOT_FOUND", "No such page.", 404);
    const made = await requestsPortOf(ctx).create(
      ctx.input.target,
      ctx.input.prompt,
      ctx.user?.id ?? null,
    );
    if (!made.ok) throw new PluginRouteError("INVALID_REQUEST", made.reason, 422);
    return { request: made.request };
  },
};

const IdInput = z.strictObject({ id: z.string().regex(ID) });
export const requestCancelRoute: PluginRoute<z.infer<typeof IdInput>> = {
  permission: "content:edit_any",
  input: IdInput,
  handler: async (ctx) => {
    const isAdmin = Number(ctx.user?.role ?? 0) >= ADMIN_ROLE;
    if (!(await requestsPortOf(ctx).cancel(ctx.input.id, ctx.user?.id ?? null, isAdmin)))
      throw new PluginRouteError("NOT_FOUND", "No such request.", 404);
    return { id: ctx.input.id };
  },
};
