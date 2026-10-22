import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

/** One tool result as the MCP spec defines it. */
export type ToolResult = {
  content: { type: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
};

/** Where the bridge sends tool calls: the site's EmDash MCP endpoint (R1 D-054). */
export interface Remote {
  /** `name` is the EmDash name, `emvb__<tool>`. */
  call(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  close(): Promise<void>;
}

/** W-498: an error never carries the token on to the agent (a header error quotes it). */
export function redactToken(error: unknown, token: string): unknown {
  if (!token || !(error instanceof Error) || !error.message.includes(token)) return error;
  const clean = new Error(error.message.split(token).join("[token]"));
  clean.name = error.name;
  return clean;
}

/** W-894: how long one call to the site may take before the bridge gives up (the SDK's default, made explicit). */
export const CALL_TIMEOUT_MS = 60_000;

/** W-894: pauses before the second and third connect attempts. */
const CONNECT_RETRY_DELAYS_MS = [250, 1000] as const;

/** A refused token or scope is final: retrying it can't help and only delays the clear error. */
function isRetryableConnectError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return !/40[13]|unauthori[sz]ed|forbidden|invalid[_ ](or expired )?token|expired token|scope/i.test(
    message,
  );
}

/**
 * W-894: runs `attempt` (opening the MCP session, which is safe to repeat) up to three times,
 * pausing between tries, for network-style failures only. Tool calls are never retried: a write
 * such as save_section or publish could land twice.
 */
export async function connectWithRetry<T>(
  attempt: () => Promise<T>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  delays: readonly number[] = CONNECT_RETRY_DELAYS_MS,
): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    const [wait, ...rest] = delays;
    if (wait === undefined || !isRetryableConnectError(error)) throw error;
    await sleep(wait);
    return connectWithRetry(attempt, sleep, rest);
  }
}

/** An MCP client to `https://site/_emdash/api/mcp` with the token as a Bearer, connected lazily. */
export function httpRemote(endpoint: URL, token: string, version: string): Remote {
  let connected: Promise<Client> | null = null;
  const connect = () => {
    connected ??= connectWithRetry(async () => {
      const client = new Client({ name: "emvb-mcp", version });
      const transport = new StreamableHTTPClientTransport(endpoint, {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      });
      await client.connect(transport, { timeout: CALL_TIMEOUT_MS });
      return client;
    }).catch((error: unknown) => {
      connected = null;
      throw error;
    });
    return connected;
  };
  return {
    async call(name, args) {
      try {
        const client = await connect();
        return (await client.callTool(
          { name, arguments: args },
          { timeout: CALL_TIMEOUT_MS },
        )) as ToolResult;
      } catch (error) {
        throw redactToken(error, token);
      }
    },
    async close() {
      if (connected) await (await connected).close();
    },
  };
}
