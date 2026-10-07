import { Empty, Loader, Table } from "@cloudflare/kumo";
import { SquaresFourIcon } from "@phosphor-icons/react";
import * as React from "react";
import type { ThemePartType } from "../../core/index.ts";
import { THEME_PARTS_COLLECTION } from "../../constants.ts";
import type { Fetcher } from "../api.ts";
import { listThemeParts, partTypeLabel } from "../theme-api.ts";
import { editorUrl } from "../editor/exit.ts";
import {
  EditedTime,
  ListError,
  ListSearch,
  matchesSearch,
  NewButton,
  NoMatches,
  StatusBadge,
  useList,
} from "./list-kit.tsx";
import { NewThemePartDialog } from "./NewThemePartDialog.tsx";

type Filter = "all" | ThemePartType;

const PANEL_ID = "emvb-theme-parts-panel";
const tabId = (value: Filter) => `emvb-theme-filter-${value}`;

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
  { value: "section", label: "Sections" },
  { value: "page_template", label: "Page templates" },
  { value: "popup", label: "Popups" },
  { value: "float", label: "Floats" },
];

function countByType(items: readonly { partType: ThemePartType }[]): Map<Filter, number> {
  const counts = new Map<Filter, number>([["all", items.length]]);
  for (const { partType } of items) counts.set(partType, (counts.get(partType) ?? 0) + 1);
  return counts;
}

/** Underline tabs with roving focus: arrows, Home and End move and select. */
function FilterTabs({
  filter,
  counts,
  onChange,
}: {
  filter: Filter;
  counts: Map<Filter, number>;
  onChange: (next: Filter) => void;
}) {
  const refs = React.useRef(new Map<Filter, HTMLButtonElement>());

  const onKeyDown = (event: React.KeyboardEvent) => {
    const at = FILTERS.findIndex((f) => f.value === filter);
    const last = FILTERS.length - 1;
    const to =
      event.key === "ArrowRight"
        ? (at + 1) % FILTERS.length
        : event.key === "ArrowLeft"
          ? (at - 1 + FILTERS.length) % FILTERS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : -1;
    const next = FILTERS[to]?.value;
    if (next === undefined) return;
    event.preventDefault();
    onChange(next);
    refs.current.get(next)?.focus();
  };

  return (
    <div
      className="emvb-theme-filters"
      role="tablist"
      aria-label="Filter by type"
      onKeyDown={onKeyDown}
    >
      {FILTERS.map(({ value, label }) => {
        const count = counts.get(value) ?? 0;
        const selected = filter === value;
        return (
          <button
            key={value}
            ref={(node) => {
              if (node) refs.current.set(value, node);
              else refs.current.delete(value);
            }}
            id={tabId(value)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={PANEL_ID}
            tabIndex={selected ? 0 : -1}
            className="emvb-theme-filter"
            data-active={selected ? "true" : undefined}
            onClick={() => onChange(value)}
          >
            {label}
            {count > 0 && <span className="emvb-theme-filter-count emvb-tabular">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Theme Builder list: title, type, conditions, status, last edited; New theme part. */
export function ThemePartList({ fetcher }: { fetcher: Fetcher }) {
  const list = useList(fetcher, listThemeParts);
  const [creating, setCreating] = React.useState(false);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [query, setQuery] = React.useState("");

  const newPart = <NewButton label="New theme part" onClick={() => setCreating(true)} />;

  const visible =
    list.state === "ready"
      ? filter === "all"
        ? list.items
        : list.items.filter((p) => p.partType === filter)
      : [];
  const shown = visible.filter((p) =>
    matchesSearch(query, p.title, partTypeLabel(p.partType), p.conditionsSummary),
  );

  const emptyFilterLabel =
    filter === "all" ? "theme parts" : FILTERS.find((f) => f.value === filter)?.label.toLowerCase();

  return (
    <>
      <div className="emvb-list-header">
        <h1 className="emvb-page-title">Theme Builder</h1>
        {list.state === "ready" && list.items.length > 0 && newPart}
      </div>
      {list.state === "ready" && list.items.length > 0 && (
        <>
          <FilterTabs filter={filter} counts={countByType(list.items)} onChange={setFilter} />
          <ListSearch value={query} onChange={setQuery} label="Search theme parts" />
        </>
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
            description="Create a Header, Footer, content template, Popup, or Float."
            contents={newPart}
          />
        </div>
      )}
      {list.state === "ready" && list.items.length > 0 && (
        <div role="tabpanel" id={PANEL_ID} aria-labelledby={tabId(filter)}>
          {visible.length === 0 ? (
            <div className="emvb-surface-card emvb-empty-shell">
              <Empty
                icon={<SquaresFourIcon size={32} aria-hidden="true" />}
                title={`No ${emptyFilterLabel} yet`}
                description="Create one or choose a different filter."
                contents={newPart}
              />
            </div>
          ) : shown.length === 0 ? (
            <NoMatches query={query} />
          ) : (
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
                  {shown.map((part) => (
                    <Table.Row key={part.id} data-emvb-row={part.id}>
                      <Table.Cell>
                        <a
                          className="emvb-row-title"
                          href={editorUrl(part.id, THEME_PARTS_COLLECTION)}
                        >
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
        </div>
      )}
      <NewThemePartDialog fetcher={fetcher} open={creating} onOpenChange={setCreating} />
    </>
  );
}
