import type { PluginRoute, RouteContext } from "emdash";
import { z } from "zod";
import { isRecord } from "../core/record.ts";
import { ProposalTarget } from "../core/proposals.ts";

/**
 * W-929 (D-064): which pages are open in the EmVB editor right now. EmVB's editor is a plugin page,
 * so it holds no EmDash edit lock, and plugin content writes skip that lock anyway. The editor
 * renews a short lease here instead; agent writes to a page with a live lease are refused and
 * pointed at propose_changes, so the person editing reviews them.
 */

/** A closed tab frees the page within this long. The editor renews at a third of it. */
export const PRESENCE_LEASE_MS = 90_000;
const MAX_HOLDERS = 20;

type Holders = Record<string, number>;
type Kv = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
};

const keyOf = (target: z.infer<typeof ProposalTarget>) =>
  `presence:${target.collection}:${target.id}`;

function live(raw: unknown, now: number): Holders {
  if (!isRecord(raw)) return {};
  const out: Holders = {};
  for (const [user, until] of Object.entries(raw)) {
    if (typeof until === "number" && until > now && until <= now + PRESENCE_LEASE_MS)
      out[user] = until;
  }
  return out;
}

/** Renews (open) or ends (closed) `userId`'s lease on a page. */
export async function setPresence(
  kv: Kv,
  target: z.infer<typeof ProposalTarget>,
  userId: string,
  open: boolean,
  now = Date.now(),
): Promise<void> {
  const key = keyOf(target);
  const holders = live(await kv.get<unknown>(key), now);
  if (open) holders[userId] = now + PRESENCE_LEASE_MS;
  else delete holders[userId];
  const kept = Object.entries(holders)
    .toSorted(([, a], [, b]) => b - a)
    .slice(0, MAX_HOLDERS);
  if (kept.length === 0) await kv.delete(key);
  else await kv.set(key, Object.fromEntries(kept));
}

/** True while someone has the page open in the EmVB editor. */
export async function isOpenInEditor(
  kv: Kv,
  target: z.infer<typeof ProposalTarget>,
  now = Date.now(),
): Promise<boolean> {
  return Object.keys(live(await kv.get<unknown>(keyOf(target)), now)).length > 0;
}

const PresenceInput = z.strictObject({ target: ProposalTarget, open: z.boolean() });

/** The editor's heartbeat: `open: true` every PRESENCE_LEASE_MS / 3, `open: false` on close. */
export const presenceRoute: PluginRoute<z.infer<typeof PresenceInput>> = {
  permission: "content:edit_any",
  input: PresenceInput,
  handler: async (ctx: RouteContext<z.infer<typeof PresenceInput>>) => {
    const userId = ctx.user?.id;
    if (userId) {
      await setPresence(ctx.kv as unknown as Kv, ctx.input.target, userId, ctx.input.open);
    }
    return { leaseMs: PRESENCE_LEASE_MS };
  },
};
