import * as React from "react";
import type { DesignSystem } from "../../core/schema/design.ts";
import type { Fetcher } from "../api.ts";
import { recordAccepted, withdrawProposal, type PendingProposal } from "../proposals-api.ts";
import { acceptOps, ghostCss, ghostOf, type EditorBase, type Ghost } from "./co-design.ts";
import type { EditorAction, EditorState } from "./store.ts";
import { useProposals, type ProposalsState } from "./useProposals.ts";

export type Decision = "accepted" | "rejected";

export type CoDesign = {
  proposals: ProposalsState;
  /** Per proposal id, per op index. Undecided ops are pending. */
  decisions: Record<string, Record<number, Decision>>;
  pending: (p: PendingProposal) => number[];
  accept: (p: PendingProposal, indexes: readonly number[]) => void;
  reject: (p: PendingProposal, indexes: readonly number[]) => void;
  /** The proposal shown as a ghost on the canvas, if any. */
  previewId: string | null;
  setPreviewId: (id: string | null) => void;
  ghost: (Ghost & { css: string }) | null;
  /** Why the last accept was refused, in the editor's words. */
  error: string | null;
  clearError: () => void;
  /** Changes accepted since the last save. */
  unsaved: number;
};

/** The editor state as a proposal base, with the style revision the server compares against. */
const editorBase = (state: EditorState): EditorBase => ({
  rev: state.rev,
  layout: state.page.layout,
  design: state.design,
  designRevision: state.designRevision ?? state.publishedRevision ?? null,
});

const stalePage =
  "This proposal was made for an earlier version of the page. Ask the agent to propose again.";

/**
 * W-930: review state for the co-design panel. Accepted page changes are one undoable edit each
 * (`apply-arranged`); accepted class and variable changes go through the normal style draft save.
 * A proposal is withdrawn once every change in it is decided, and the next Save draft after any
 * accept is labelled "Via agent" in the timeline.
 */
export function useCoDesign({
  fetcher,
  collection,
  state,
  dispatch,
  changeDesign,
  onError,
  enabled = true,
}: {
  fetcher: Fetcher;
  collection: string;
  state: EditorState;
  dispatch: (action: EditorAction) => void;
  changeDesign: (design: DesignSystem) => Promise<unknown>;
  onError: (message: string) => void;
  /** Off in field mode: agents propose to EmVB pages only. */
  enabled?: boolean;
}): CoDesign {
  const proposals = useProposals(fetcher, collection, state.id, enabled);
  const [decisions, setDecisions] = React.useState<CoDesign["decisions"]>({});
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [unsaved, setUnsaved] = React.useState(0);
  const latest = React.useRef(state);
  latest.current = state;

  const pending = React.useCallback(
    (p: PendingProposal) =>
      p.proposal.ops.map((_, i) => i).filter((i) => decisions[p.id]?.[i] === undefined),
    [decisions],
  );

  const decide = (p: PendingProposal, indexes: readonly number[], decision: Decision) => {
    const next = { ...decisions[p.id] };
    for (const i of indexes) next[i] = decision;
    setDecisions((all) => ({ ...all, [p.id]: next }));
    if (p.proposal.ops.every((_, i) => next[i] !== undefined)) {
      if (previewId === p.id) setPreviewId(null);
      const decided = Object.values(next);
      withdrawProposal(fetcher, p.id, {
        accepted: decided.filter((d) => d === "accepted").length,
        rejected: decided.filter((d) => d === "rejected").length,
      }).then(proposals.refresh, () => undefined);
    }
  };

  const accept = (p: PendingProposal, indexes: readonly number[]) => {
    const current = latest.current;
    const result = acceptOps(editorBase(current), p.proposal, indexes);
    if (!result.ok) {
      setError(result.code === "STALE_BASE" ? stalePage : result.reason);
      return;
    }
    setError(null);
    dispatch({
      type: "apply-arranged",
      layout: result.layout,
      selected: current.selectedId ?? result.layout.root.id,
    });
    if (result.designChanged) {
      changeDesign(result.design).catch((e: unknown) =>
        onError(e instanceof Error ? e.message : "Couldn't save the accepted site styles."),
      );
    }
    setUnsaved((n) => n + indexes.length);
    decide(p, indexes, "accepted");
  };

  const reject = (p: PendingProposal, indexes: readonly number[]) => {
    setError(null);
    decide(p, indexes, "rejected");
  };

  // The next save after an accept is a normal version, labelled "Via agent" (W-930).
  const savedRev = React.useRef(state.rev);
  const unsavedRef = React.useRef(unsaved);
  unsavedRef.current = unsaved;
  React.useEffect(() => {
    if (state.rev === savedRev.current) return;
    savedRev.current = state.rev;
    const accepted = unsavedRef.current;
    if (accepted <= 0) return;
    setUnsaved(0);
    recordAccepted(fetcher, collection, state.id, accepted).catch(() => undefined);
  }, [state.rev, fetcher, collection, state.id]);

  const previewed = proposals.items.find((p) => p.id === previewId) ?? null;
  const ghost = React.useMemo(() => {
    if (!previewed) return null;
    const g = ghostOf(editorBase(state), previewed.proposal, pending(previewed));
    return g ? { ...g, css: ghostCss(g) } : null;
  }, [previewed, state, pending]);

  return {
    proposals,
    decisions,
    pending,
    accept,
    reject,
    previewId: previewed ? previewId : null,
    setPreviewId,
    ghost,
    error,
    clearError: () => setError(null),
    unsaved,
  };
}
