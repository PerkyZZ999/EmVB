import { Empty, Loader, Table } from "@cloudflare/kumo";
import { SquaresFourIcon } from "@phosphor-icons/react";
import * as React from "react";
import type { ThemePartType } from "../../core/index.ts";
import { THEME_PARTS_COLLECTION } from "../../constants.ts";
import type { Fetcher } from "../api.ts";
import { listThemeParts, partTypeLabel } from "../theme-api.ts";
import { editorUrl } from "../editor/exit.ts";
import { EditedTime, ListError, NewButton, StatusBadge, useList } from "./list-kit.tsx";
import { NewThemePartDialog } from "./NewThemePartDialog.tsx";

type Filter = "all" | ThemePartType;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "header", label: "Headers" },
  { value: "footer", label: "Footers" },
  { value: "error_404", label: "Error 404" },
  { value: "search_results", label: "Search Results" },
  { value: "single_page", label: "Single Page" },
  { value: "single_post", label: "Single Post" },
  { value: "archive", label: "Archive" },
  { value: "loop_item", label: "Loop Item" },
  { value: "popup", label: "Popups" },
];

/** Theme Builder list: title, type, conditions, status, last edited; New theme part. */
export function ThemePartList({ fetcher }: { fetcher: Fetcher }) {
  const list = useList(fetcher, listThemeParts);
  const [creating, setCreating] = React.useState(false);
  const [filter, setFilter] = React.useState<Filter>("all");

  const newPart = <NewButton label="New theme part" onClick={() => setCreating(true)} />;

  const visible =
    list.state === "ready"
      ? filter === "all"
        ? list.items
        : list.items.filter((p) => p.partType === filter)
      : [];

  const emptyFilterLabel =
    filter === "all" ? "theme parts" : FILTERS.find((f) => f.value === filter)?.label.toLowerCase();

  return (
    <>
      <div className="emvb-list-header">
        <h1 className="emvb-page-title">Theme Builder</h1>
        {list.state === "ready" && list.items.length > 0 && newPart}
      </div>
      {list.state === "ready" && list.items.length > 0 && (
        <div className="emvb-theme-filters" role="tablist" aria-label="Filter by type">
          {FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              className="emvb-theme-filter"
              data-active={filter === value ? "true" : undefined}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {list.state === "loading" && <Loader />}
      {list.state === "error" && (
        <ListError title="Couldn't load theme parts" message={list.message} />
      )}
      {list.state === "ready" && list.items.length === 0 && (
        <div className="emvb-surface-card emvb-empty-shell">
          <Empty
            icon={<SquaresFourIcon size={32} aria-hidden="true" />}
            title="No site parts yet"
            description="Create a Header, Footer, content template, or Popup."
            contents={newPart}
          />
        </div>
      )}
      {list.state === "ready" && list.items.length > 0 && visible.length === 0 && (
        <div className="emvb-surface-card emvb-empty-shell">
          <Empty
            icon={<SquaresFourIcon size={32} aria-hidden="true" />}
            title={`No ${emptyFilterLabel} yet`}
            description="Create one or choose a different filter."
            contents={newPart}
          />
        </div>
      )}
      {list.state === "ready" && visible.length > 0 && (
        <div className="emvb-surface-card" data-emvb-list="theme-parts">
          <Table data-emvb-list="theme-parts">
            <Table.Header>
              <Table.Row>
                <Table.Head>Title</Table.Head>
                <Table.Head>Type</Table.Head>
                <Table.Head>Conditions</Table.Head>
                <Table.Head>Status</Table.Head>
                <Table.Head>Last edited</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {visible.map((part) => (
                <Table.Row key={part.id} data-emvb-row={part.id}>
                  <Table.Cell>
                    <a className="emvb-row-title" href={editorUrl(part.id, THEME_PARTS_COLLECTION)}>
                      {part.title}
                    </a>
                  </Table.Cell>
                  <Table.Cell>{partTypeLabel(part.partType)}</Table.Cell>
                  <Table.Cell>
                    <span className="emvb-tabular">{part.conditionsSummary}</span>
                  </Table.Cell>
                  <Table.Cell>
                    <StatusBadge status={part.status} />
                  </Table.Cell>
                  <Table.Cell>
                    <EditedTime iso={part.updatedAt} />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}
      <NewThemePartDialog fetcher={fetcher} open={creating} onOpenChange={setCreating} />
    </>
  );
}
