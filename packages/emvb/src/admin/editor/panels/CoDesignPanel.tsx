import { Banner, Button, Empty } from "@cloudflare/kumo";
import {
  CheckIcon,
  EyeIcon,
  EyeSlashIcon,
  RobotIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { Layout } from "../../../core/index.ts";
import type { PendingProposal } from "../../proposals-api.ts";
import { describeOp, groupOf, GROUP_LABELS, GROUP_ORDER, type Op } from "../co-design.ts";
import type { CoDesign } from "../useCoDesign.ts";
import { AgentRequestBox } from "./AgentRequestBox.tsx";

const when = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};

/**
 * W-930 co-design review (D-064, D-067): agent proposals for this page, each change listed by group
 * with its own Accept and Reject. Agent text is shown as quoted content, never as instructions.
 */
export function CoDesignPanel({ co, layout }: { co: CoDesign; layout: Layout | null }) {
  const { items, ready, failed } = co.proposals;
  return (
    <div className="emvb-codesign" data-emvb-codesign="">
      <AgentRequestBox co={co} />
      <p
        className="emvb-helper emvb-codesign-status"
        aria-live="polite"
        data-emvb-codesign-status=""
      >
        <RobotIcon size={14} aria-hidden="true" />
        {failed
          ? "Can't reach the site to check for agent proposals. Retrying."
          : !ready
            ? "Checking for agent proposals…"
            : items.length === 0
              ? "No agent proposals for this page."
              : `${items.length} ${items.length === 1 ? "proposal" : "proposals"} waiting for review.`}
        {co.unsaved > 0 && ` ${co.unsaved} accepted, not saved yet.`}
      </p>
      {co.error && (
        <Banner
          role="alert"
          variant="error"
          icon={<WarningCircleIcon aria-hidden="true" />}
          title="Couldn't accept that change"
          description={co.error}
          data-emvb-codesign-error=""
        />
      )}
      {ready && items.length === 0 && (
        <div className="emvb-site-empty-card" data-emvb-codesign-empty="">
          <Empty
            size="sm"
            icon={<RobotIcon size={24} aria-hidden="true" />}
            title="Nothing to review"
            description="When your agent answers a request, or proposes changes on its own, they show here for you to accept or reject one by one. Nothing changes until you do."
          />
        </div>
      )}
      {items.map((p) => (
        <ProposalCard key={p.id} p={p} co={co} layout={layout} />
      ))}
    </div>
  );
}

function ProposalCard({
  p,
  co,
  layout,
}: {
  p: PendingProposal;
  co: CoDesign;
  layout: Layout | null;
}) {
  const pending = co.pending(p);
  const previewing = co.previewId === p.id;
  const decided = co.decisions[p.id] ?? {};
  if (pending.length === 0) return null;
  return (
    <section
      className="emvb-codesign-card"
      aria-label={`Agent proposal from ${when(p.createdAt)}`}
      data-emvb-proposal={p.id}
    >
      <header className="emvb-codesign-head">
        <strong>Proposal · {when(p.createdAt)}</strong>
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={previewing}
          data-emvb-proposal-preview=""
          icon={previewing ? <EyeSlashIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
          onClick={() => co.setPreviewId(previewing ? null : p.id)}
        >
          {previewing ? "Hide preview" : "Preview"}
        </Button>
      </header>
      {GROUP_ORDER.map((group) => {
        const ops = pending.filter((i) => groupOf(p.proposal.ops[i] as Op) === group);
        if (ops.length === 0) return null;
        return (
          <div key={group} className="emvb-codesign-group" data-emvb-proposal-group={group}>
            <h4 className="emvb-codesign-group-title">{GROUP_LABELS[group]}</h4>
            <ul className="emvb-codesign-ops">
              {ops.map((i) => {
                const text = describeOp(p.proposal.ops[i] as Op, layout);
                return (
                  <li key={i} className="emvb-codesign-op" data-emvb-proposal-op={i}>
                    <span className="emvb-codesign-op-text">{text}</span>
                    <span className="emvb-codesign-op-actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        shape="square"
                        aria-label={`Accept: ${text}`}
                        title="Accept"
                        data-emvb-op-accept=""
                        icon={<CheckIcon aria-hidden="true" />}
                        onClick={() => co.accept(p, [i])}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        shape="square"
                        aria-label={`Reject: ${text}`}
                        title="Reject"
                        data-emvb-op-reject=""
                        icon={<XIcon aria-hidden="true" />}
                        onClick={() => co.reject(p, [i])}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      <footer className="emvb-codesign-actions">
        <Button
          size="sm"
          variant="primary"
          data-emvb-accept-all=""
          onClick={() => co.accept(p, pending)}
        >
          Accept all ({pending.length})
        </Button>
        <Button
          size="sm"
          variant="secondary"
          data-emvb-reject-all=""
          onClick={() => co.reject(p, pending)}
        >
          Reject all
        </Button>
        {Object.keys(decided).length > 0 && (
          <span className="emvb-helper">{Object.keys(decided).length} decided</span>
        )}
      </footer>
    </section>
  );
}
