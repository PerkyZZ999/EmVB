import { Banner, Button, Empty, Loader, Table } from "@cloudflare/kumo";
import { PlusIcon, SquaresFourIcon, WarningCircleIcon } from "@phosphor-icons/react";
import * as React from "react";
import type { Fetcher } from "../api.ts";
import { listThemeParts, type ThemePartSummary } from "../theme-api.ts";
import { editorUrl } from "../editor/exit.ts";
import { BUTTON, SOLID_PRIMARY } from "../ui.ts";
import { NewThemePartDialog } from "./NewThemePartDialog.tsx";
import { THEME_PARTS_COLLECTION } from "../../constants.ts";

type ListState =
  | { state: "loading" }
  | { state: "ready"; parts: ThemePartSummary[] }
  | { state: "error"; message: string };

const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const formatDate = (iso: string) => (iso ? formatter.format(new Date(iso)) : "");

const typeLabel = (type: "header" | "footer") => (type === "header" ? "Header" : "Footer");

/** Theme Builder list: title, type, conditions, status, last edited; New theme part. */
export function ThemePartList({ fetcher }: { fetcher: Fetcher }) {
  const [list, setList] = React.useState<ListState>({ state: "loading" });
  const [creating, setCreating] = React.useState(false);
  const [filter, setFilter] = React.useState<"all" | "header" | "footer">("all");

  React.useEffect(() => {
    let active = true;
    listThemeParts(fetcher).then(
      (parts) => active && setList({ state: "ready", parts }),
      (error: unknown) =>
        active &&
        setList({
          state: "error",
          message: error instanceof Error ? error.message : String(error),
        }),
    );
    return () => {
      active = false;
    };
  }, [fetcher]);

  const newPart = (
    <Button
      variant="primary"
      className={BUTTON}
      style={SOLID_PRIMARY}
      icon={<PlusIcon aria-hidden="true" />}
      onClick={() => setCreating(true)}
    >
      New theme part
    </Button>
  );

  const visible =
    list.state === "ready"
      ? filter === "all"
        ? list.parts
        : list.parts.filter((p) => p.partType === filter)
      : [];

  return (
    <>
      <div className="emvb-list-header">
        <h1 className="emvb-page-title">Theme Builder</h1>
        {list.state === "ready" && list.parts.length > 0 && newPart}
      </div>
      {list.state === "ready" && list.parts.length > 0 && (
        <div className="emvb-theme-filters" role="tablist" aria-label="Filter by type">
          {(
            [
              ["all", "All"],
              ["header", "Headers"],
              ["footer", "Footers"],
            ] as const
          ).map(([value, label]) => (
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
        <Banner
          variant="error"
          icon={<WarningCircleIcon aria-hidden="true" />}
          title="Couldn't load theme parts"
          description={list.message}
        />
      )}
      {list.state === "ready" && list.parts.length === 0 && (
        <div className="emvb-surface-card emvb-empty-shell">
          <Empty
            icon={<SquaresFourIcon size={32} aria-hidden="true" />}
            title="No headers or footers yet"
            description="Create a Header or Footer and set where it appears on your site."
            contents={newPart}
          />
        </div>
      )}
      {list.state === "ready" && list.parts.length > 0 && visible.length === 0 && (
        <div className="emvb-surface-card emvb-empty-shell">
          <Empty
            icon={<SquaresFourIcon size={32} aria-hidden="true" />}
            title={`No ${filter}s yet`}
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
                    <a
                      className="emvb-row-title"
                      href={editorUrl(part.id, THEME_PARTS_COLLECTION)}
                    >
                      {part.title}
                    </a>
                  </Table.Cell>
                  <Table.Cell>{typeLabel(part.partType)}</Table.Cell>
                  <Table.Cell>
                    <span className="emvb-tabular">{part.conditionsSummary}</span>
                  </Table.Cell>
                  <Table.Cell>
                    <span className="emvb-status" data-status={part.status}>
                      <span className="emvb-status-dot" aria-hidden="true" />
                      {part.status === "published" ? "Published" : "Draft"}
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    <time dateTime={part.updatedAt} title={part.updatedAt} className="emvb-tabular">
                      {formatDate(part.updatedAt)}
                    </time>
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
