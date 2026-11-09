/** Error codes an MCP tool reports back to the agent (plan § 2 Errors). */
export type McpErrorCode =
  | "INVALID_INPUT"
  | "INVALID_LAYOUT"
  | "NESTING"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PUBLISH_DISABLED"
  | "FORBIDDEN"
  | "TOO_LARGE"
  | "REFUSED"
  | "NOT_SET_UP"
  | "RATE_LIMITED"
  | "PAGE_OPEN";

const STATUS: Record<McpErrorCode, number> = {
  INVALID_INPUT: 400,
  INVALID_LAYOUT: 422,
  NESTING: 422,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PUBLISH_DISABLED: 403,
  FORBIDDEN: 403,
  TOO_LARGE: 413,
  REFUSED: 422,
  NOT_SET_UP: 409,
  RATE_LIMITED: 429,
  PAGE_OPEN: 409,
};

/**
 * A tool failure the agent can act on. Routes turn it into a `PluginRouteError`, which EmDash's
 * MCP server reports as a tool result with `isError: true`, not a protocol error (SEP-1303).
 */
export class McpToolError extends Error {
  readonly code: McpErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  constructor(code: McpErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "McpToolError";
    this.code = code;
    this.status = STATUS[code];
    if (details) this.details = details;
  }
}
