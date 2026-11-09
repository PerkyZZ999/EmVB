import * as React from "react";
import { listProposals, type PendingProposal } from "../proposals-api.ts";
import type { Fetcher } from "../api.ts";

/** How often the open editor asks for new proposals (D-063: EmDash's MCP has no push). */
const POLL_MS = 5_000;

export type ProposalsState = {
  items: PendingProposal[];
  /** True once the first request answered; false while loading or after a failure. */
  ready: boolean;
  failed: boolean;
  refresh: () => void;
};

/**
 * W-930: polls the page's proposals while the tab is visible. A failed poll keeps the last list
 * and says so; the next tick retries.
 */
export function useProposals(
  fetcher: Fetcher,
  collection: string,
  id: string,
  enabled = true,
): ProposalsState {
  const [items, setItems] = React.useState<PendingProposal[]>([]);
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const refresh = React.useCallback(() => setTick((t) => t + 1), []);
  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      listProposals(fetcher, collection, id).then(
        (next) => {
          if (cancelled) return;
          setItems((prev) => (sameList(prev, next) ? prev : next));
          setReady(true);
          setFailed(false);
        },
        () => {
          if (!cancelled) setFailed(true);
        },
      );
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [fetcher, collection, id, tick, enabled]);
  return { items, ready, failed, refresh };
}

const sameList = (a: PendingProposal[], b: PendingProposal[]) =>
  a.length === b.length && a.every((p, i) => p.id === b[i]?.id);
