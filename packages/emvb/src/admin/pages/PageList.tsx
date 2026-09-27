import { Banner, Button, Empty, Loader, Table } from "@cloudflare/kumo";
import { FileIcon, PlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import * as React from "react";
import type { Fetcher } from "../api.ts";
import { listPages, type PageSummary } from "../content-api.ts";
import { editorUrl } from "../editor/exit.ts";
import { BUTTON, SOLID_PRIMARY } from "../ui.ts";
import { NewPageDialog } from "./NewPageDialog.tsx";

type ListState =
  | { state: "loading" }
  | { state: "ready"; pages: PageSummary[] }
  | { state: "error"; message: string };

const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const formatDate = (iso: string) => (iso ? formatter.format(new Date(iso)) : "");

/** The Visual pages list (IA): title and slug, status, last edited; New page. */
export function PageList({ fetcher }: { fetcher: Fetcher }) {
  const [list, setList] = React.useState<ListState>({ state: "loading" });
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    listPages(fetcher).then(
      (pages) => active && setList({ state: "ready", pages }),
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

  const newPage = (
    <Button
      variant="primary"
      className={BUTTON}
      style={SOLID_PRIMARY}
      icon={<PlusIcon aria-hidden="true" />}
      onClick={() => setCreating(true)}
    >
      New page
    </Button>
  );

  return (
    <>
      <div className="emvb-list-header">
        <h1 className="emvb-page-title">Visual pages</h1>
        {list.state === "ready" && list.pages.length > 0 && newPage}
      </div>
      {list.state === "loading" && <Loader />}
      {list.state === "error" && (
        <Banner
          variant="error"
          icon={<WarningCircleIcon aria-hidden="true" />}
          title="Couldn't load your pages"
          description={list.message}
        />
      )}
      {list.state === "ready" && list.pages.length === 0 && (
        <Empty
          icon={<FileIcon size={32} aria-hidden="true" />}
          title="No visual pages yet"
          description="Create a page to start building."
          contents={newPage}
        />
      )}
      {list.state === "ready" && list.pages.length > 0 && (
        <Table data-emvb-list="pages">
          <Table.Header>
            <Table.Row>
              <Table.Head>Title</Table.Head>
              <Table.Head>Status</Table.Head>
              <Table.Head>Last edited</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {list.pages.map((page) => (
              <Table.Row key={page.id} data-emvb-row={page.id}>
                <Table.Cell>
                  <a className="emvb-row-title" href={editorUrl(page.id)}>
                    {page.title}
                  </a>
                  <div className="emvb-row-slug">/{page.slug}</div>
                </Table.Cell>
                <Table.Cell>
                  <span className="emvb-status" data-status={page.status}>
                    <span className="emvb-status-dot" aria-hidden="true" />
                    {page.status === "published" ? "Published" : "Draft"}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <time dateTime={page.updatedAt} title={page.updatedAt} className="emvb-tabular">
                    {formatDate(page.updatedAt)}
                  </time>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
      <NewPageDialog fetcher={fetcher} open={creating} onOpenChange={setCreating} />
    </>
  );
}
