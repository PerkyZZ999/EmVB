import * as React from "react";
import { requestJson, type Fetcher } from "../api.ts";
import { planSetup } from "./plan.ts";
import { readCollection, runSetup } from "./run.ts";

/** EmDash's ADMIN role; only admins hold `schema:manage`. */
const ADMIN_ROLE = 50;

type SetupStatus =
  | { state: "loading" }
  | { state: "missing" | "outdated" | "ready"; isAdmin: boolean; conflicts: string[] }
  | { state: "error"; message: string };

export function useSetupStatus(fetcher: Fetcher) {
  const [status, setStatus] = React.useState<SetupStatus>({ state: "loading" });
  const [running, setRunning] = React.useState(false);

  const refresh = React.useCallback(async () => {
    try {
      const [me, collection] = await Promise.all([
        requestJson<{ role: number }>(fetcher, "/_emdash/api/auth/me"),
        readCollection(fetcher),
      ]);
      const { steps, conflicts } = planSetup(collection);
      const state = !collection
        ? "missing"
        : steps.length > 0 || conflicts.length > 0
          ? "outdated"
          : "ready";
      setStatus({ state, isAdmin: me.role >= ADMIN_ROLE, conflicts });
    } catch (error) {
      setStatus({
        state: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [fetcher]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const setup = React.useCallback(async () => {
    setRunning(true);
    try {
      await runSetup(fetcher);
    } catch (error) {
      setStatus({
        state: "error",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    } finally {
      setRunning(false);
    }
    await refresh();
  }, [fetcher, refresh]);

  return { status, running, setup };
}
