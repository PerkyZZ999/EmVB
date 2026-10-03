import { Empty, Loader, Table } from "@cloudflare/kumo";
import { FileIcon } from "@phosphor-icons/react";
import * as React from "react";
import type { Fetcher } from "../api.ts";
import { listPages } from "../content-api.ts";
import { editorUrl } from "../editor/exit.ts";
import { EditedTime, ListError, NewButton, StatusBadge, useList } from "./list-kit.tsx";
import { NewPageDialog } from "./NewPageDialog.tsx";

/** The Visual pages list (IA): title and slug, status, last edited; New page. */
export function PageList({ fetcher }: { fetcher: Fetcher }) {
  const list = useList(fetcher, listPages);
  const [creating, setCreating] = React.useState(false);

  const newPage = <NewButton label="New page" onClick={() => setCreating(true)} />;

  return (
    <>
      <div className="emvb-list-header">
        <h1 className="emvb-page-title">Pages VisualBuilder</h1>
        {list.state === "ready" && list.items.length > 0 && newPage}
      </div>
      {list.state === "loading" && <Loader />}
      {list.state === "error" && (
        <ListError title="Couldn't load your pages" message={list.message} />
      )}
      {list.state === "ready" && list.items.length === 0 && (
        <div className="emvb-surface-card emvb-empty-shell">
          <Empty
            icon={<FileIcon size={32} aria-hidden="true" />}
            title="No visual pages yet"
            description="Create a page to start building."
            contents={newPage}
          />
        </div>
      )}
      {list.state === "ready" && list.items.length > 0 && (
        <div className="emvb-surface-card" data-emvb-list="pages">
          <Table data-emvb-list="pages">
            <Table.Header>
              <Table.Row>
                <Table.Head>Title</Table.Head>
                <Table.Head>Status</Table.Head>
                <Table.Head>Last edited</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {list.items.map((page) => (
                <Table.Row key={page.id} data-emvb-row={page.id}>
                  <Table.Cell>
                    <a className="emvb-row-title" href={editorUrl(page.id)}>
                      {page.title}
                    </a>
                    <div className="emvb-row-slug">/{page.slug}</div>
                  </Table.Cell>
                  <Table.Cell>
                    <StatusBadge status={page.status} />
                  </Table.Cell>
                  <Table.Cell>
                    <EditedTime iso={page.updatedAt} />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}
      <NewPageDialog fetcher={fetcher} open={creating} onOpenChange={setCreating} />
    </>
  );
}
