import * as React from "react";
import { EDITOR_ROLE } from "../../constants.ts";
import { ApiError, requestJson, type Fetcher } from "../api.ts";

export async function readRole(fetcher: Fetcher): Promise<number> {
  try {
    const me = await requestJson<{ role?: unknown }>(fetcher, "/_emdash/api/auth/me");
    return typeof me.role === "number" ? me.role : 0;
  } catch (error) {
    // A 200 with no body is "no role", the same as a role that is not a number.
    if (error instanceof ApiError && error.code === "MISSING_DATA") return 0;
    throw error;
  }
}

/** D-020: EmVB is for editors and administrators. The server enforces the same line. */
export const canUseEmvb = (role: number) => role >= EDITOR_ROLE;

type RoleState =
  | { state: "loading" }
  | { state: "ready"; role: number }
  | { state: "error"; message: string; retry: () => void };

export function useRole(fetcher: Fetcher): RoleState {
  const [status, setStatus] = React.useState<RoleState>({ state: "loading" });
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    let active = true;
    setStatus({ state: "loading" });
    readRole(fetcher).then(
      (role) => active && setStatus({ state: "ready", role }),
      (error: unknown) =>
        active &&
        setStatus({
          state: "error",
          message: error instanceof Error ? error.message : String(error),
          retry: () => setAttempt((n) => n + 1),
        }),
    );
    return () => {
      active = false;
    };
  }, [fetcher, attempt]);
  return status;
}
