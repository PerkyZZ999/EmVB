import type {
  Proposal,
  ProposalRecord,
  ProposalRefusal,
  applyProposal,
} from "../core/proposals.ts";
import type { AgentSettings } from "./settings.ts";
import type { RateClass } from "./rate-limit.ts";
import type {
  DesignSystem,
  Layout,
  Refusal,
  RequiredFieldInfo,
  SavedSection,
  SavedSectionRecord,
  SavedSectionSummary,
} from "../core/index.ts";

/** A page as the tool core sees it: the current draft (or published) data and its revision. */
export type PageRecord = {
  id: string;
  title: string;
  slug: string;
  status: string;
  /** True when a saved draft differs from what is live. */
  hasDraft: boolean;
  layout: unknown;
  /** EmDash `_rev`; writes check it (D-058). */
  rev: string;
  updatedAt: string;
};

export type PageSummary = Omit<PageRecord, "layout" | "rev">;

export type RevisionSummary = { id: string; createdAt: string; authorId: string | null };

export type DesignState = {
  design: DesignSystem;
  revision: string | null;
  publishedRevision: string | null;
  unpublished: boolean;
};

/** Who is calling. EmDash has already checked the token scope and the editor role (D-056). */
export type Caller = { userId: string | null; role: number; client?: string };

/** One agent change, shown in the Timeline and the Agents tab (D-057). */
export type AgentLogEntry = {
  target: "page" | "styles";
  tool: string;
  pageId?: string;
  rev?: string;
  revisionId?: string;
  /** W-933 audit: which proposal, and how many changes it carried. */
  proposalId?: string;
  changes?: number;
  summary: string;
};

/**
 * Everything the tool core reads or writes goes through these ports (D-053). The plugin builds
 * them on `ctx.content` and plugin storage; tests build them in memory.
 */
export interface EmvbPorts {
  caller: Caller;
  /** Counts the call against the caller's rate limit; throws RATE_LIMITED when full (W-478). */
  rateLimit?(cls: RateClass): Promise<void>;
  listPages(options: { cursor?: string; limit: number }): Promise<{
    pages: PageSummary[];
    nextCursor?: string;
  }>;
  getPage(id: string): Promise<PageRecord | null>;
  listRevisions(id: string, limit: number): Promise<RevisionSummary[]>;
  getDesign(): Promise<DesignState>;
  getRevisionData(pageId: string, revisionId: string): Promise<Record<string, unknown> | null>;
  /** Writes the draft when the stored `_rev` is still `expectedRev`; else McpToolError CONFLICT. */
  savePage(
    id: string,
    patch: { layout?: Layout; title?: string },
    expectedRev: string,
  ): Promise<{ rev: string; revisionId?: string }>;
  createPage(input: {
    title: string;
    layout: Layout;
  }): Promise<{ id: string; slug: string; rev: string }>;
  /** Saves the style draft with compare-and-set; McpToolError CONFLICT when it moved. */
  saveDesign(design: DesignSystem, expectedRevision: string | null): Promise<{ revision: string }>;
  log(entry: AgentLogEntry): Promise<void>;
  /** The admin's agent settings (D-055). Read-only for tools. */
  settings(): Promise<AgentSettings>;
  /** Publishes the page when its `_rev` is still `expectedRev`; else McpToolError CONFLICT. */
  publishPage(id: string, expectedRev: string): Promise<{ rev: string }>;
  /** Publishes the style draft when the published revision is still `expectedPublishedRevision`. */
  publishDesign(expectedPublishedRevision: string | null): Promise<{ revision: string }>;
  /**
   * W-511: each form's fields as the forms plugin defines them, for describe_page's required-field
   * warnings. Forms it can't read are left out; without this port there are no such warnings.
   */
  formFields?(
    formIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly RequiredFieldInfo[]>>;
  /** W-875: saved sections; without it the saved-section tools answer NOT_SET_UP. */
  savedSections?: SavedSectionsPort;
  /** W-929: reviewable agent proposals (D-064); without it the proposal tools answer NOT_SET_UP. */
  proposals?: ProposalsPort;
  /**
   * W-929 (D-064): true while the page is open in the EmVB editor. Direct page writes are then
   * refused with PAGE_OPEN and the agent proposes instead. Without this port nothing is refused.
   */
  pageOpen?(id: string): Promise<boolean>;
  /** W-931: the editor's requests for agents (prompt relay); without it get_requests is NOT_SET_UP. */
  requests?: RequestsPort;
}

/** W-931: a person's request for their agent, written in the editor's Agent tab. */
export type AgentRequest = {
  id: string;
  target: Proposal["target"];
  prompt: string;
  createdAt: string;
  status: "open" | "answered";
  proposalId?: string;
};

export interface RequestsPort {
  /** The person's requests for the page, newest first (the editor's list). */
  list(target: Proposal["target"], userId: string | null): Promise<AgentRequest[]>;
  /**
   * The person's open, unexpired requests, oldest first (what their agent should answer). A
   * request is private to its author (W-990, S-01): no one else's are ever returned.
   */
  open(userId: string | null, target?: Proposal["target"]): Promise<AgentRequest[]>;
  create(
    target: Proposal["target"],
    prompt: string,
    userId: string | null,
  ): Promise<{ ok: true; request: AgentRequest } | { ok: false; reason: string }>;
  /** Deletes a request of the person's own, or anyone's for an admin. */
  cancel(id: string, userId: string | null, isAdmin: boolean): Promise<boolean>;
  /** Marks the person's open request for `target` answered by a proposal; false otherwise. */
  answer(
    id: string,
    target: Proposal["target"],
    proposalId: string,
    userId: string | null,
  ): Promise<boolean>;
  /** An agent checked for requests now (the editor's "connected" status). */
  seen(): Promise<void>;
  lastSeen(): Promise<string | null>;
}

/** Saved sections in plugin storage `emvb_saved_sections` (W-875, D-060). */
export interface SavedSectionsPort {
  list(): Promise<SavedSectionSummary[]>;
  /** The section read and upgraded; null when there is none; a Refusal when it can't be read. */
  get(id: string): Promise<SavedSection | Refusal | null>;
  /** Stores a new section; a Refusal when the list is full. */
  create(record: SavedSectionRecord): Promise<{ id: string } | Refusal>;
  rename(id: string, name: string): Promise<SavedSectionSummary | Refusal | null>;
  remove(id: string): Promise<boolean>;
}

/** W-928: storage and checked previews only; never writes or publishes content. */
export interface ProposalsPort {
  create(
    proposal: unknown,
    /** S-09 (W-998): the proposer, so only they (or an admin) withdraw it from an agent. */
    createdBy?: string | null,
  ): Promise<{ ok: true; id: string; record: ProposalRecord } | ProposalRefusal>;
  get(
    id: string,
  ): Promise<{ ok: true; id: string; record: ProposalRecord } | ProposalRefusal | null>;
  list(target: Proposal["target"]): Promise<{ id: string; record: ProposalRecord }[]>;
  withdraw(id: string): Promise<boolean>;
  /** W-929: the revisions a new proposal for `target` must name; null when there is no such page. */
  base(target: Proposal["target"]): Promise<{
    revision: string;
    designRevision: string | null;
  } | null>;
  prepare(
    id: string,
    selected?: readonly number[],
  ): Promise<ReturnType<typeof applyProposal> | null>;
}
