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
