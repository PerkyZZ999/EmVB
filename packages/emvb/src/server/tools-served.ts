import type { ToolDef } from "../mcp/tools.ts";

/**
 * W-932: EmDash approves a plugin's MCP tools as a snapshot of the tool list and hides them again
 * when the list changes (an EmVB update), without saying so to the plugin. EmVB notes which tool
 * list EmDash last actually served, so the AI agents page can tell "working on this version" from
 * "approved, but maybe for an older list".
 */

const KEY = "mcp:served";
type Kv = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
};

/** FNV-1a over what EmDash's consent covers: names, descriptions and the destructive flag. */
export function toolListFingerprint(tools: readonly ToolDef[]): string {
  let hash = 0x811c9dc5;
  const text = tools
    .map((t) => `${t.name}\u0000${t.description}\u0000${t.destructive}`)
    .join("\u0001");
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${tools.length}-${hash.toString(16)}`;
}

/** Called when EmDash's own MCP endpoint ran an EmVB tool; writes only when the list changed. */
export async function noteServed(kv: Kv, fingerprint: string): Promise<void> {
  if ((await kv.get<string>(KEY)) !== fingerprint) await kv.set(KEY, fingerprint);
}

export async function servedCurrent(kv: Kv, fingerprint: string): Promise<boolean> {
  return (await kv.get<string>(KEY)) === fingerprint;
}

/** EmDash's MCP endpoint, as opposed to calling the plugin route `mcp/<tool>` directly. */
export const viaEmDashMcp = (request: Request): boolean => {
  try {
    return new URL(request.url).pathname === "/_emdash/api/mcp";
  } catch {
    return false;
  }
};
