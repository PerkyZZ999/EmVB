import { Button, Dialog } from "@cloudflare/kumo";
import * as React from "react";
import {
  changedIds,
  diffSections,
  renderPage,
  restoreSection,
  validateLayout,
  type DesignSystem,
  type Layout,
  type SectionChange,
} from "../../core/index.ts";
import { ApiError, requestJson, type Fetcher } from "../api.ts";
import { ELEMENT_NAMES } from "./panels/ElementPanel.tsx";

type RevisionItem = {
  id: string;
  createdAt: string;
  authorId?: string | null;
  data?: Record<string, unknown>;
};

type TimelineVersion = { id: string; at: string; layout: Layout | null };

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
      .then((body) => {
        if (cancelled) return;
        const versions = (body?.items ?? [])
          .map((item) => ({ id: item.id, at: item.createdAt, layout: revisionLayout(item.data) }))
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

/** A small, script-free picture of one version with its changed sections outlined (W-315). */
function Snapshot({
  layout,
  design,
  ids,
  title,
}: {
  layout: Layout;
  design: DesignSystem;
  ids: Partial<Record<"added" | "removed" | "changed", string[]>>;
  title: string;
}) {
  const doc = React.useMemo(() => {
    const { html, css } = renderPage(layout, design, { mode: "editor" });
    const outline = (Object.entries(ids) as [keyof typeof DIFF_CSS, string[]][])
      .flatMap(([kind, list]) => list.map((id) => `[data-emvb-id="${id}"]{${DIFF_CSS[kind]}}`))
      .join("");
    return `<!doctype html><html><head><style>html{zoom:.35}body{margin:0}${css}${outline}</style></head><body>${html}</body></html>`;
  }, [layout, design, ids]);
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetcher: Fetcher;
  collection: string;
  entryId: string;
  current: Layout | null;
  design: DesignSystem;
  onApply: (layout: Layout, note: string) => void;
}) {
  const revisions = useRevisions(fetcher, collection, entryId, open);
  const [pickedId, setPickedId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const versions = revisions.kind === "ready" ? revisions.versions : [];
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
          <p className="emvb-helper" data-emvb-timeline-empty="">
            No saved versions yet. Each save adds one.
          </p>
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
                    onClick={() => setPickedId(v.id)}
                  >
                    {when(v.at)}
                    {!v.layout && " (no layout)"}
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
                      />
                    </figure>
                    <figure>
                      <figcaption>Now</figcaption>
                      <Snapshot
                        layout={current}
                        design={design}
                        ids={{ added: ids.added, changed: ids.changed }}
                        title="Current page"
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
