import { PluginRouteError, type PluginRoute, type RouteContext } from "emdash";
import { z } from "zod";
import { MAX_OPEN_REQUESTS_PER_PAGE, MAX_REQUEST_PROMPT } from "../core/limits.ts";
import { ProposalTarget } from "../core/proposals.ts";
import { isRecord } from "../core/record.ts";
import type { AgentRequest, RequestsPort } from "../mcp/ports.ts";
import { queued } from "../mcp/queue.ts";

/**
 * W-931 prompt relay (D-063: bring-your-own agent). A person writes a request in the editor's
 * Agent tab; their own agent reads it with get_requests and answers with propose_changes. Nothing
 * here calls a model or holds a key. Requests are the person's words for their agent: they are
 * shown back as plain text and never reach a page.
 */

const COLLECTION = "emvb_requests";
const ID = /^[0-9a-f]{16}$/;
/** Requests older than this are no longer offered to agents. */
const REQUEST_TTL_MS = 24 * 3_600_000;
const SEEN_KEY = "relay:seen";

type Target = z.infer<typeof ProposalTarget>;
type Stored = {
  target: Target;
  prompt: string;
  createdAt: string;
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
    async list(target) {
      return (await all())
        .filter((r) => sameTarget(r.stored.target, target))
        .map((r) => toRequest(r.id, r.stored));
    },
    async open(target) {
      return (await all())
        .filter((r) => r.stored.status === "open" && live(r.stored))
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
        const open = (await all()).filter(
          (r) =>
            r.stored.status === "open" && live(r.stored) && sameTarget(r.stored.target, target),
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
    cancel: (id) => queued("requests", async () => ID.test(id) && (await store.delete(id))),
    answer: (id, target, proposalId) =>
      queued("requests", async () => {
        if (!ID.test(id)) return false;
        const stored = read(await store.get(id));
        if (!stored || stored.status !== "open" || !sameTarget(stored.target, target)) return false;
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
    return { items: await port.list(ctx.input), agentSeenAt: await port.lastSeen() };
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
    if (!(await requestsPortOf(ctx).cancel(ctx.input.id)))
      throw new PluginRouteError("NOT_FOUND", "No such request.", 404);
    return { id: ctx.input.id };
  },
};
