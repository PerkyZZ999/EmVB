import * as React from "react";
import { EDITOR_ROLE } from "../../constants.ts";
import { requestJson, type Fetcher } from "../api.ts";

export async function readRole(fetcher: Fetcher): Promise<number> {
  const me = await requestJson<{ role?: unknown } | undefined>(fetcher, "/_emdash/api/auth/me");
  return typeof me?.role === "number" ? me.role : 0;
}

/** D-020: EmVB is for editors and administrators. The server enforces the same line. */
export const canUseEmvb = (role: number) => role >= EDITOR_ROLE;

type RoleState =
  | { state: "loading" }
  | { state: "ready"; role: number }
  | { state: "error"; message: string };

export function useRole(fetcher: Fetcher): RoleState {
  const [status, setStatus] = React.useState<RoleState>({ state: "loading" });
  React.useEffect(() => {
    let active = true;
    readRole(fetcher).then(
      (role) => active && setStatus({ state: "ready", role }),
      (error: unknown) =>
        active &&
        setStatus({
          state: "error",
          message: error instanceof Error ? error.message : String(error),
        }),
    );
    return () => {
      active = false;
    };
  }, [fetcher]);
  return status;
}
