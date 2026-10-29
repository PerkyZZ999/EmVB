import {
  PluginRouteError,
  type ContentPolicyDecision,
  type ContentPolicyEvent,
  type PluginContext,
  type PluginRoute,
} from "emdash";
import { z } from "zod";
import { PAGES_COLLECTION, THEME_PARTS_COLLECTION } from "../constants.ts";
import { canvasFieldSlugs } from "./hooks.ts";
import { AgentSettings, DEFAULT_AGENT_SETTINGS } from "../mcp/settings.ts";

/** Plugin KV key of the agent settings (plan § 4, D-055). */
const AGENT_SETTINGS_KEY = "agent-settings";

/** The agent settings and their revision. Missing or damaged settings read as the safe defaults. */
export async function readAgentSettings(
  ctx: Pick<PluginContext, "kv">,
): Promise<{ settings: AgentSettings; revision: string | null }> {
  const stored = await ctx.kv.getVersioned<unknown>(AGENT_SETTINGS_KEY);
  if (!stored) return { settings: DEFAULT_AGENT_SETTINGS, revision: null };
  const parsed = AgentSettings.safeParse(stored.value);
  return {
    settings: parsed.success ? parsed.data : DEFAULT_AGENT_SETTINGS,
    revision: stored.revision,
  };
}

type LogQuery = {
  query(o: {
    where?: Record<string, unknown>;
    orderBy: Record<string, "asc" | "desc">;
    limit: number;
  }): Promise<{
    items: { id: string; data: unknown }[];
  }>;
  put(id: string, data: unknown): Promise<void>;
  deleteMany?(ids: string[]): Promise<number>;
};

/** Agent activity is kept this many days (W-522). */
const AGENT_LOG_DAYS = 90;

/**
 * Adds one agent activity entry and drops up to 100 entries older than AGENT_LOG_DAYS. The log
 * had no limit, so a busy agent token (60 changes a minute) grew it without end (W-522).
 */
export async function appendAgentLog(
  store: LogQuery,
  entry: Record<string, unknown>,
  now: Date = new Date(),
): Promise<void> {
  const at = now.toISOString();
  await store.put(`${at}-${crypto.randomUUID().slice(0, 8)}`, { ...entry, at });
  if (!store.deleteMany) return;
  const cutoff = new Date(now.getTime() - AGENT_LOG_DAYS * 86_400_000).toISOString();
  const old = await store.query({
    where: { at: { lt: cutoff } },
    orderBy: { at: "asc" },
    limit: 100,
  });
  const ids = old.items.map((item) => item.id);
  if (ids.length > 0) await store.deleteMany(ids);
}

const agentLog = (ctx: PluginContext) => ctx.storage["agentlog"] as unknown as LogQuery;

/** Agents tab: the settings, the MCP endpoint and the last 50 agent changes. Admins only. */
export const agentsRoute: PluginRoute = {
  permission: "plugins:manage",
  handler: async (ctx) => {
    const { settings, revision } = await readAgentSettings(ctx);
    const log = await agentLog(ctx).query({ orderBy: { at: "desc" }, limit: 50 });
    return {
      settings,
      revision,
      endpoint: new URL("/_emdash/api/mcp", ctx.request.url).toString(),
      activity: log.items.map((item) => Object.assign({ id: item.id }, item.data as object)),
    };
  },
};

const PageAgentsInput = z.object({ pageId: z.string().min(1).max(128) });

/**
 * W-460: the page's versions an agent saved, for the Timeline's Agent badge and filter. Editors
 * can read this (it carries no settings); the full activity list stays admin-only.
 */
export const pageAgentVersionsRoute: PluginRoute<z.infer<typeof PageAgentsInput>> = {
  permission: "content:edit_any",
  input: PageAgentsInput,
  handler: async (ctx) => {
    const log = await agentLog(ctx).query({
      where: { pageId: ctx.input.pageId },
      orderBy: { at: "desc" },
      limit: 100,
    });
    const versions = log.items
      .map(
        (item) => item.data as { revisionId?: string; tool: string; summary: string; at: string },
      )
      .filter((entry) => entry.revisionId)
      .map((entry) => ({
        revisionId: entry.revisionId as string,
        tool: entry.tool,
        summary: entry.summary,
        at: entry.at,
      }));
    return { versions };
  },
};

const SaveInput = z.object({ settings: AgentSettings, revision: z.string().nullable() });

/** Saves the agent settings (compare-and-set). Admins only; no MCP tool can reach this. */
export const agentsSaveRoute: PluginRoute<z.infer<typeof SaveInput>> = {
  permission: "plugins:manage",
  input: SaveInput,
  handler: async (ctx) => {
    const write = await ctx.kv.compareAndSet(
      AGENT_SETTINGS_KEY,
      ctx.input.revision,
      ctx.input.settings,
    );
    if (!write.applied) {
      throw PluginRouteError.conflict("The agent settings changed somewhere else.");
    }
    const s = ctx.input.settings;
    await appendAgentLog(agentLog(ctx), {
      target: "settings",
      tool: "settings",
      userId: ctx.user?.id ?? null,
      summary: `Agent settings: access ${s.mcpEnabled ? "on" : "off"}, publish pages ${s.publishPages ? "on" : "off"}, publish styles ${s.publishStyles ? "on" : "off"}`,
    });
    return { revision: write.revision };
  },
};

const OWNED = new Set([PAGES_COLLECTION, THEME_PARTS_COLLECTION]);

/**
 * D-055: refuse publishing EmVB content through EmDash's own MCP tools (e.g. `content_publish`)
 * unless the admin let agents publish pages. Our `publish_page` tool publishes with a plugin
 * origin after its own settings check.
 */
export async function beforePublish(
  event: ContentPolicyEvent,
  ctx: PluginContext,
  canvasCollections: readonly string[] = [],
): Promise<ContentPolicyDecision> {
  const hostEntry = canvasCollections.includes(event.collection);
  if (!OWNED.has(event.collection) && !hostEntry) return undefined;
  const source = event.origin.source === "mcp" || event.actor?.source === "mcp";
  if (!source) return undefined;
  // W-899: a host entry falls under the EmVB rule only while it holds an EmVB layout.
  if (hostEntry && !(await holdsCanvasLayout(event, ctx))) return undefined;
  const { settings } = await readAgentSettings(ctx);
  if (settings.mcpEnabled && settings.publishPages) return undefined;
  return {
    cancel: true,
    reason:
      "Agents may not publish EmVB pages on this site. An admin can allow it in Pages VisualBuilder → AI agents.",
  };
}

async function holdsCanvasLayout(event: ContentPolicyEvent, ctx: PluginContext): Promise<boolean> {
  const record = event.content;
  const data =
    record["data"] && typeof record["data"] === "object"
      ? (record["data"] as Record<string, unknown>)
      : record;
  const slugs = await canvasFieldSlugs(ctx, event.collection);
  return slugs.some((slug) => data[slug] !== null && data[slug] !== undefined && data[slug] !== "");
}
