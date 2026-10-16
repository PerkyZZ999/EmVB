import { Button, Dialog } from "@cloudflare/kumo";
import { RobotIcon, SquaresFourIcon, UserIcon, type Icon } from "@phosphor-icons/react";
import * as React from "react";
import {
  canvasStyleUrls,
  changedIds,
  diffSections,
  escapeAttr,
  renderPage,
  restoreSection,
  validateLayout,
  type DesignSystem,
  type Layout,
  type SectionChange,
} from "../../core/index.ts";
import { ApiError, requestJson, type Fetcher } from "../api.ts";
import { PLUGIN_ID } from "../../constants.ts";
import { ELEMENT_NAMES } from "./element-chrome.ts";

type RevisionItem = {
  id: string;
  createdAt: string;
  authorId?: string | null;
  data?: Record<string, unknown>;
};

type TimelineVersion = {
  id: string;
  at: string;
  layout: Layout | null;
  /** Set when an AI agent saved this version (W-460). */
  agent?: { tool: string; summary: string };
};

type AgentVersion = { revisionId: string; tool: string; summary: string };

/** Which versions an agent saved; none when the site has no agent log (older EmVB). */
const agentVersions = (fetcher: Fetcher, entryId: string) =>
  requestJson<{ versions: AgentVersion[] }>(
    fetcher,
    `/_emdash/api/plugins/${PLUGIN_ID}/agents/page`,
    {
      method: "POST",
      body: { pageId: entryId },
    },
  ).then(
    (body) => new Map((body.versions ?? []).map((v) => [v.revisionId, v])),
    () => new Map<string, AgentVersion>(),
  );

type Who = "all" | "people" | "agents";
const WHO_LABELS: Record<Who, string> = { all: "All", people: "People", agents: "Agents" };
const WHO_ICONS: Record<Who, Icon> = { all: SquaresFourIcon, people: UserIcon, agents: RobotIcon };

/** A revision's layout, or null when it has none or it doesn't validate (W-315). */
export function revisionLayout(data: Record<string, unknown> | undefined): Layout | null {
  let raw: unknown = data?.["layout"];
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object") return null;
  const result = validateLayout(raw);
  return result.ok ? result.layout : null;
}

/** A host without EmDash revisions for this collection answers 404. */
export const NO_REVISIONS =
  "This site doesn't keep saved versions of this page, so there's no timeline to show.";

function useRevisions(fetcher: Fetcher, collection: string, entryId: string, open: boolean) {
  const [state, setState] = React.useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ready"; versions: TimelineVersion[] }
  >({ kind: "loading" });
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ kind: "loading" });
    requestJson<{ items?: RevisionItem[] }>(
      fetcher,
      `/_emdash/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(entryId)}/revisions?limit=50`,
    )
      .then(async (body) => ({ body, agents: await agentVersions(fetcher, entryId) }))
      .then(({ body, agents }) => {
        if (cancelled) return;
        const versions = (body?.items ?? [])
          .map((item): TimelineVersion => {
            const agent = agents.get(item.id);
            const version: TimelineVersion = {
              id: item.id,
              at: item.createdAt,
              layout: revisionLayout(item.data),
            };
            if (agent) version.agent = { tool: agent.tool, summary: agent.summary };
            return version;
          })
          .toSorted((a, b) => (a.at < b.at ? 1 : -1));
        setState({ kind: "ready", versions });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            kind: "error",
            message:
              error instanceof ApiError && error.status === 404
                ? NO_REVISIONS
                : `Couldn't load versions: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fetcher, collection, entryId, open]);
  return state;
}

const KIND_LABELS: Record<SectionChange["kind"], string> = {
  added: "Added since",
  removed: "Removed since",
  changed: "Changed",
  moved: "Moved",
  same: "Unchanged",
};

const DIFF_CSS = {
  added: "outline:3px solid #16a34a;outline-offset:-3px",
  removed: "outline:3px solid #dc2626;outline-offset:-3px",
  changed: "outline:3px solid #d97706;outline-offset:-3px",
};

const when = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

/** A version's day and time on two short lines, so the list doesn't wrap mid-time (W-477). */
const whenParts = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { day: iso, time: "" };
  return {
    day: date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    time: date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
};

/** A small, script-free picture of one version with its changed sections outlined (W-315). */
function Snapshot({
  layout,
  design,
  ids,
  title,
  canvasStyles = [],
}: {
  layout: Layout;
  design: DesignSystem;
  ids: Partial<Record<"added" | "removed" | "changed", string[]>>;
  title: string;
  /** Host stylesheets, before EmVB's CSS, the same order as the canvas (W-351). */
  canvasStyles?: readonly string[];
}) {
  const doc = React.useMemo(() => {
    const { html, css } = renderPage(layout, design, { mode: "editor" });
    const outline = (Object.entries(ids) as [keyof typeof DIFF_CSS, string[]][])
      .flatMap(([kind, list]) => list.map((id) => `[data-emvb-id="${id}"]{${DIFF_CSS[kind]}}`))
      .join("");
    const links = canvasStyleUrls([...canvasStyles])
      .map((href) => `<link rel="stylesheet" href="${escapeAttr(href)}" data-emvb-canvas-style="">`)
      .join("");
    return `<!doctype html><html><head>${links}<style>html{zoom:.35}body{margin:0}${css}${outline}</style></head><body>${html}</body></html>`;
  }, [layout, design, ids, canvasStyles]);
  return <iframe className="emvb-timeline-frame" title={title} sandbox="" srcDoc={doc} />;
}

/**
 * Version timeline (W-315): every saved version of the page, a side-by-side picture against the
 * current page with what changed outlined, and restore for one section or the whole version.
 * Restoring is an ordinary edit: undo takes it back, and nothing is saved until you save.
 */
export function TimelineDialog({
  open,
  onOpenChange,
  fetcher,
  collection,
  entryId,
  current,
  design,
  onApply,
  canvasStyles = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetcher: Fetcher;
  collection: string;
  entryId: string;
  current: Layout | null;
  design: DesignSystem;
  onApply: (layout: Layout, note: string) => void;
  /** Host stylesheets the canvas already loads (W-351). */
  canvasStyles?: readonly string[];
}) {
  const revisions = useRevisions(fetcher, collection, entryId, open);
  const [pickedId, setPickedId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [who, setWho] = React.useState<Who>("all");
  // A refusal belongs to the visit it happened in; closing the timeline clears it (W-623).
  React.useEffect(() => {
    if (!open) setError(null);
  }, [open]);
  const all = revisions.kind === "ready" ? revisions.versions : [];
  const hasAgents = all.some((v) => v.agent);
  const visibleWho = hasAgents ? who : "all";
  const versions = all.filter((v) =>
    visibleWho === "all" ? true : visibleWho === "agents" ? Boolean(v.agent) : !v.agent,
  );
  const picked = versions.find((v) => v.id === pickedId) ?? versions[0];
  const changes = React.useMemo(
    () => (picked?.layout && current ? diffSections(picked.layout, current) : []),
    [picked, current],
  );
  const ids = React.useMemo(() => changedIds(changes), [changes]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="xl" className="p-6 emvb-timeline" data-emvb-timeline="">
        <Dialog.Title>Version timeline</Dialog.Title>
        {revisions.kind === "loading" && <p className="emvb-helper">Loading versions…</p>}
        {revisions.kind === "error" && (
          <p className="emvb-helper" role="alert">
            {revisions.message}
          </p>
        )}
        {revisions.kind === "ready" && versions.length === 0 && (
          <p className="emvb-helper" role="status" data-emvb-timeline-empty="">
            {all.length === 0
              ? "No saved versions yet. Each save adds one."
              : "No saved versions match this filter. Choose All to see every version."}
          </p>
        )}
        {hasAgents && (
          <div className="emvb-timeline-who" role="group" aria-label="Show versions by">
            {(Object.keys(WHO_LABELS) as Who[]).map((key) => {
              const WhoIcon = WHO_ICONS[key];
              const count =
                key === "all"
                  ? all.length
                  : all.filter((v) => (key === "agents" ? v.agent : !v.agent)).length;
              return (
                <button
                  key={key}
                  type="button"
                  className="emvb-timeline-who-option"
                  aria-pressed={visibleWho === key}
                  data-emvb-timeline-who={key}
                  onClick={() => {
                    setWho(key);
                    setPickedId(null);
                    setError(null);
                  }}
                >
                  <WhoIcon aria-hidden="true" size={14} />
                  {WHO_LABELS[key]}
                  <span className="emvb-timeline-count" aria-label={`, ${count}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {picked && current && (
          <div className="emvb-timeline-body">
            <ol className="emvb-timeline-list" aria-label="Saved versions">
              {versions.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    className="emvb-timeline-version"
                    aria-current={v.id === picked.id ? "true" : undefined}
                    data-emvb-version={v.id}
                    onClick={() => {
                      setPickedId(v.id);
                      // W-561: a refusal is about the version it came from.
                      setError(null);
                    }}
                  >
                    <span className="emvb-timeline-when">
                      <span>{whenParts(v.at).day}</span>
                      <span className="emvb-timeline-time">
                        {whenParts(v.at).time}
                        {!v.layout && " (no layout)"}
                      </span>
                    </span>
                    {v.agent && (
                      <span
                        className="emvb-timeline-agent"
                        data-emvb-agent-version=""
                        title={v.agent.summary}
                      >
                        <RobotIcon aria-hidden="true" size={12} />
                        Agent
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ol>
            <div className="emvb-timeline-main">
              {picked.layout ? (
                <>
                  <div className="emvb-timeline-frames">
                    <figure>
                      <figcaption>{when(picked.at)}</figcaption>
                      <Snapshot
                        layout={picked.layout}
                        design={design}
                        ids={{ removed: ids.removed, changed: ids.changed }}
                        title="Saved version"
                        canvasStyles={canvasStyles}
                      />
                    </figure>
                    <figure>
                      <figcaption>Now</figcaption>
                      <Snapshot
                        layout={current}
                        design={design}
                        ids={{ added: ids.added, changed: ids.changed }}
                        title="Current page"
                        canvasStyles={canvasStyles}
                      />
                    </figure>
                  </div>
                  <ul className="emvb-timeline-changes" data-emvb-timeline-changes="">
                    {changes.map((change) => (
                      <li key={`${change.kind}:${change.id}`} data-kind={change.kind}>
                        <span className="emvb-timeline-kind">{KIND_LABELS[change.kind]}</span>{" "}
                        {change.label || ELEMENT_NAMES[change.type] || change.type}
                        {change.kind === "changed" &&
                          ` · ${change.edits} element${change.edits === 1 ? "" : "s"}`}
                        {(change.kind === "changed" || change.kind === "removed") && (
                          <button
                            type="button"
                            className="emvb-link-button"
                            data-emvb-restore-section={change.id}
                            onClick={() => {
                              if (!picked.layout) return;
                              const result = restoreSection(current, picked.layout, change.id);
                              if (!result.ok) {
                                setError(result.reason);
                                return;
                              }
                              setError(null);
                              onApply(result.layout, "Section restored");
                            }}
                          >
                            Restore this section
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {error && (
                    <p className="emvb-helper" role="alert">
                      {error}
                    </p>
                  )}
                  <p className="emvb-helper">
                    Restoring changes the page here; undo takes it back, and nothing is saved until
                    you save.
                  </p>
                  <Button
                    variant="secondary"
                    data-emvb-restore-version=""
                    onClick={() => {
                      if (!picked.layout) return;
                      onApply(picked.layout, "Version restored");
                      onOpenChange(false);
                    }}
                  >
                    Restore this whole version
                  </Button>
                </>
              ) : (
                <p className="emvb-helper">This version has no page layout to compare.</p>
              )}
            </div>
          </div>
        )}
        <Dialog.Close render={(props) => <Button {...props}>Close</Button>} />
      </Dialog>
    </Dialog.Root>
  );
}
