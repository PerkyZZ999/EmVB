import { z } from "zod";
import { boundedArray } from "../core/bounded-array.ts";
import { PAGES_COLLECTION } from "../constants.ts";
import { MAX_PROPOSAL_OPS } from "../core/limits.ts";
import { ProposalOperation, type Proposal, type ProposalRefusal } from "../core/proposals.ts";
import { McpToolError } from "./errors.ts";
import type { EmvbPorts, ProposalsPort } from "./ports.ts";
import { loadPage, outlineOf, stats } from "./read.ts";
import { PageId } from "./write.ts";

/**
 * Proposal tools (W-929, D-064). An agent reads a compact outline with the base revisions, then
 * proposes ordered ops a person accepts or rejects in the editor. Nothing here writes or publishes
 * the page: the store checks every op against the current page and keeps the change set only.
 */

const ProposalId = z.string().regex(/^[0-9a-f]{16}$/, "Proposal ids are 16 hex characters");
const Revision = z.string().min(1).max(256);

const portOf = (ports: EmvbPorts): ProposalsPort => {
  if (!ports.proposals) {
    throw new McpToolError("NOT_SET_UP", "Proposals aren't available on this site.");
  }
  return ports.proposals;
};

const targetOf = (pageId: string): Proposal["target"] => ({
  collection: PAGES_COLLECTION,
  id: pageId,
});

/** A store refusal as an error the agent can act on: what failed, where, and what to do next. */
function refused(refusal: ProposalRefusal): McpToolError {
  switch (refusal.code) {
    case "STALE_BASE":
      return new McpToolError(
        "CONFLICT",
        `${refusal.reason} Call list_page_outline again and propose against the new revisions.`,
        {
          expectedRevision: refusal.expectedRevision ?? null,
          currentRevision: refusal.currentRevision ?? null,
        },
      );
    case "NOT_FOUND":
      return new McpToolError("NOT_FOUND", `${refusal.reason} Call list_pages.`);
    case "PROPOSALS_FULL":
      return new McpToolError("REFUSED", refusal.reason);
    default:
      return new McpToolError(
        "INVALID_INPUT",
        refusal.opIndex === undefined
          ? refusal.reason
          : `Change ${refusal.opIndex}: ${refusal.reason}`,
        refusal.opIndex === undefined ? undefined : { opIndex: refusal.opIndex },
      );
  }
}

const Pending = z.object({
  proposalId: z.string(),
  createdAt: z.string(),
  changes: z.number(),
});

// ---------------------------------------------------------------- list_page_outline

export const ListPageOutlineInput = z.strictObject({ pageId: PageId });
export const ListPageOutlineOutput = z.object({
  pageId: z.string(),
  title: z.string(),
  baseRevision: z.string(),
  baseDesignRevision: z.string().nullable(),
  outline: z.unknown(),
  stats: z.object({ nodes: z.number(), depth: z.number(), bytes: z.number() }),
  /** Someone has the page open in the editor: direct writes are refused, propose instead. */
  openInEditor: z.boolean(),
  pendingProposals: z.array(Pending),
});

export async function listPageOutline(
  ports: EmvbPorts,
  input: z.infer<typeof ListPageOutlineInput>,
) {
  const proposals = portOf(ports);
  const { page, layout } = await loadPage(ports, input.pageId);
  const base = await proposals.base(targetOf(page.id));
  if (!base) throw new McpToolError("NOT_FOUND", `No EmVB page with id ${input.pageId}.`);
  const pending = await proposals.list(targetOf(page.id));
  return {
    pageId: page.id,
    title: page.title,
    baseRevision: base.revision,
    baseDesignRevision: base.designRevision,
    outline: outlineOf(layout.root),
    stats: stats(layout),
    openInEditor: (await ports.pageOpen?.(page.id)) ?? false,
    pendingProposals: pending.map(({ id, record }) => ({
      proposalId: id,
      createdAt: record.createdAt,
      changes: record.proposal.ops.length,
    })),
  };
}

// ---------------------------------------------------------------- propose_changes

export const ProposeChangesInput = z.strictObject({
  pageId: PageId,
  baseRevision: Revision,
  baseDesignRevision: Revision.nullable(),
  ops: boundedArray(ProposalOperation, MAX_PROPOSAL_OPS, 1),
});
export const ProposeChangesOutput = z.object({
  proposalId: z.string(),
  pageId: z.string(),
  createdAt: z.string(),
  changes: z.number(),
});

export async function proposeChanges(ports: EmvbPorts, input: z.infer<typeof ProposeChangesInput>) {
  const created = await portOf(ports).create({
    version: 1,
    target: targetOf(input.pageId),
    baseRevision: input.baseRevision,
    baseDesignRevision: input.baseDesignRevision,
    ops: input.ops,
  });
  if (!created.ok) throw refused(created);
  const changes = created.record.proposal.ops.length;
  await ports.log({
    target: "page",
    tool: "propose_changes",
    pageId: input.pageId,
    rev: input.baseRevision,
    proposalId: created.id,
    changes,
    summary: `Proposed ${changes} ${changes === 1 ? "change" : "changes"} for review`,
  });
  return {
    proposalId: created.id,
    pageId: input.pageId,
    createdAt: created.record.createdAt,
    changes,
  };
}

// ---------------------------------------------------------------- get_proposal

export const GetProposalInput = z.strictObject({ proposalId: ProposalId });
export const GetProposalOutput = z.object({
  proposalId: z.string(),
  pageId: z.string(),
  collection: z.string(),
  createdAt: z.string(),
  baseRevision: z.string(),
  baseDesignRevision: z.string().nullable(),
  ops: z.array(z.unknown()),
  /** Whether every change still applies to the page as it is now. */
  applies: z.boolean(),
  problem: z
    .object({ code: z.string(), reason: z.string(), opIndex: z.number().optional() })
    .optional(),
});

export async function getProposal(ports: EmvbPorts, input: z.infer<typeof GetProposalInput>) {
  const proposals = portOf(ports);
  const found = await proposals.get(input.proposalId);
  if (!found) {
    throw new McpToolError(
      "NOT_FOUND",
      `No proposal with id ${input.proposalId}. It may have been accepted, rejected or withdrawn.`,
    );
  }
  if (!found.ok) throw new McpToolError("INVALID_INPUT", found.reason);
  const { proposal, createdAt } = found.record;
  const check = await proposals.prepare(input.proposalId);
  const problem =
    check && !check.ok
      ? {
          code: check.code,
          reason: check.reason,
          ...(check.opIndex === undefined ? {} : { opIndex: check.opIndex }),
        }
      : undefined;
  return {
    proposalId: found.id,
    pageId: proposal.target.id,
    collection: proposal.target.collection,
    createdAt,
    baseRevision: proposal.baseRevision,
    baseDesignRevision: proposal.baseDesignRevision,
    ops: proposal.ops,
    applies: check?.ok === true,
    ...(problem ? { problem } : {}),
  };
}

// ---------------------------------------------------------------- withdraw_proposal

export const WithdrawProposalInput = z.strictObject({ proposalId: ProposalId });
export const WithdrawProposalOutput = z.object({
  proposalId: z.string(),
  withdrawn: z.literal(true),
});

export async function withdrawProposal(
  ports: EmvbPorts,
  input: z.infer<typeof WithdrawProposalInput>,
) {
  const proposals = portOf(ports);
  const found = await proposals.get(input.proposalId);
  if (!found || !(await proposals.withdraw(input.proposalId))) {
    throw new McpToolError("NOT_FOUND", `No proposal with id ${input.proposalId}.`);
  }
  if (found.ok) {
    await ports.log({
      target: "page",
      tool: "withdraw_proposal",
      pageId: found.record.proposal.target.id,
      proposalId: input.proposalId,
      changes: found.record.proposal.ops.length,
      summary: "Withdrew a proposal",
    });
  }
  return { proposalId: input.proposalId, withdrawn: true as const };
}
