import { PluginRouteError, type PluginRoute, type RouteContext } from "emdash";
import { z } from "zod";
import { DESIGN_DRAFT_KEY, DESIGN_KEY } from "../constants.ts";
import { MAX_PROPOSALS } from "../core/limits.ts";
import {
  applyProposal,
  ProposalTarget,
  readProposal,
  type Proposal,
  type ProposalBase,
  type ProposalRecord,
  type ProposalRefusal,
} from "../core/proposals.ts";
import { isRecord } from "../core/record.ts";
import type { ProposalsPort } from "../mcp/ports.ts";
import { queued } from "../mcp/queue.ts";
import { readDesign } from "./design-routes.ts";

const COLLECTION = "emvb_proposals";
const ID = /^[0-9a-f]{16}$/;
type ProposalStore = {
  get(id: string): Promise<unknown>;
  put(id: string, data: ProposalRecord): Promise<void>;
  delete(id: string): Promise<boolean>;
  query(options: { orderBy: Record<string, "asc" | "desc">; limit: number }): Promise<{
    items: { id: string; data: unknown }[];
    hasMore: boolean;
  }>;
};

function readRecord(raw: unknown): { ok: true; record: ProposalRecord } | ProposalRefusal {
  if (
    !isRecord(raw) ||
    typeof raw.createdAt !== "string" ||
    !Number.isFinite(Date.parse(raw.createdAt))
  ) {
    return { ok: false, code: "INVALID_PROPOSAL", reason: "Damaged proposal record." };
  }
  const read = readProposal(raw.proposal);
  return read.ok
    ? { ok: true, record: { proposal: read.proposal, createdAt: raw.createdAt } }
    : read;
}

/** Same per-isolate write queue as saved sections. Content/design are read-only dependencies. */
export function proposalsPort(
  store: ProposalStore,
  readBase: (target: Proposal["target"]) => Promise<ProposalBase | null>,
): ProposalsPort {
  const all = () => store.query({ orderBy: { createdAt: "desc" }, limit: MAX_PROPOSALS });
  const get: ProposalsPort["get"] = async (id) => {
    if (!ID.test(id)) return null;
    const raw = await store.get(id);
    if (raw === undefined || raw === null) return null;
    const read = readRecord(raw);
    return read.ok ? { ...read, id } : read;
  };
  return {
    get,
    async list(target) {
      const items: { id: string; record: ProposalRecord }[] = [];
      for (const row of (await all()).items) {
        const read = readRecord(row.data);
        if (
          read.ok &&
          read.record.proposal.target.collection === target.collection &&
          read.record.proposal.target.id === target.id
        )
          items.push({ id: row.id, record: read.record });
      }
      return items;
    },
    create: (raw) =>
      queued("proposals", async () => {
        const read = readProposal(raw);
        if (!read.ok) return read;
        const base = await readBase(read.proposal.target);
        if (!base)
          return { ok: false, code: "NOT_FOUND", reason: "No target page with a readable layout." };
        const applied = applyProposal(base, read.proposal);
        if (!applied.ok) return applied;
        const page = await all();
        if (page.hasMore || page.items.length >= MAX_PROPOSALS)
          return {
            ok: false,
            code: "PROPOSALS_FULL",
            reason: `At most ${MAX_PROPOSALS} proposals are kept. Withdraw an old one and try again.`,
          };
        const latest = await readBase(read.proposal.target);
        if (!latest)
          return {
            ok: false,
            code: "NOT_FOUND",
            reason: "The target page is no longer available.",
          };
        const rechecked = applyProposal(latest, read.proposal);
        if (!rechecked.ok) return rechecked;
        const id = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
        const record = { proposal: read.proposal, createdAt: new Date().toISOString() };
        await store.put(id, record);
        return { ok: true, id, record };
      }),
    withdraw: (id) => queued("proposals", async () => ID.test(id) && (await store.delete(id))),
    async prepare(id, selected) {
      const read = await get(id);
      if (!read || !read.ok) return read;
      const base = await readBase(read.record.proposal.target);
      if (!base)
        return { ok: false, code: "NOT_FOUND", reason: "The target page is no longer available." };
      return applyProposal(base, read.record.proposal, selected);
    },
  };
}

function proposalPortOf(ctx: RouteContext<unknown>): ProposalsPort {
  return proposalsPort(ctx.storage[COLLECTION] as unknown as ProposalStore, async (target) => {
    const found = await ctx.content?.getVersioned?.(target.collection, target.id);
    if (!found) return null;
    let layout: unknown = found.item.data["layout"];
    if (typeof layout === "string") {
      try {
        layout = JSON.parse(layout);
      } catch {
        return null;
      }
    }
    const draft = await readDesign(ctx, DESIGN_DRAFT_KEY);
    const published = await readDesign(ctx, DESIGN_KEY);
    const styles = draft.status === "empty" ? published : draft;
    return {
      revision: found["_rev"],
      layout,
      design: styles.status === "unreadable" ? null : styles.design,
      designRevision: styles.revision,
    };
  });
}

function unwrap<T extends { ok: boolean }>(result: T | null): Extract<T, { ok: true }> {
  if (!result) throw new PluginRouteError("NOT_FOUND", "No such proposal.", 404);
  if (!result.ok) {
    const refusal = result as unknown as ProposalRefusal;
    throw new PluginRouteError(
      refusal.code,
      refusal.reason,
      refusal.code === "STALE_BASE" || refusal.code === "PROPOSALS_FULL"
        ? 409
        : refusal.code === "NOT_FOUND"
          ? 404
          : 422,
    );
  }
  return result as Extract<T, { ok: true }>;
}

// Plugin-local editor transport, not MCP tools and not a public API (W-929/W-930 follow).
export const proposalsRoute: PluginRoute<z.infer<typeof ProposalTarget>> = {
  permission: "content:edit_any",
  input: ProposalTarget,
  handler: async (ctx) => ({ items: await proposalPortOf(ctx).list(ctx.input) }),
};
const IdInput = z.strictObject({ id: z.string().regex(ID) });
export const proposalGetRoute: PluginRoute<z.infer<typeof IdInput>> = {
  permission: "content:edit_any",
  input: IdInput,
  handler: async (ctx) => unwrap(await proposalPortOf(ctx).get(ctx.input.id)),
};
const CreateInput = z.strictObject({ proposal: z.unknown() });
export const proposalCreateRoute: PluginRoute<z.infer<typeof CreateInput>> = {
  permission: "content:edit_any",
  input: CreateInput,
  handler: async (ctx) => unwrap(await proposalPortOf(ctx).create(ctx.input.proposal)),
};
export const proposalWithdrawRoute: PluginRoute<z.infer<typeof IdInput>> = {
  permission: "content:edit_any",
  input: IdInput,
  handler: async (ctx) => {
    if (!(await proposalPortOf(ctx).withdraw(ctx.input.id)))
      throw new PluginRouteError("NOT_FOUND", "No such proposal.", 404);
    return { id: ctx.input.id };
  },
};
