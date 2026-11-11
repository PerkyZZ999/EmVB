import { Empty, Table } from "@cloudflare/kumo";
import { FileIcon } from "@phosphor-icons/react";
import * as React from "react";
import type { Fetcher } from "../api.ts";
import { listPages } from "../content-api.ts";
import { editorUrl } from "../editor/exit.ts";
import { contentSnippet, matchesSearch } from "../search.ts";
import { PAGES_COLLECTION } from "../../constants.ts";
import { BulkBar, SelectAll, SelectRow, useSelection } from "./bulk.tsx";
import {
  EditedTime,
  ListError,
  ListLoading,
  ListSearch,
  NewButton,
  NoMatches,
  StatusBadge,
  useList,
} from "./list-kit.tsx";
import { ImportElementorDialog } from "./ImportElementorDialog.tsx";
import { ImportButton } from "./ImportButton.tsx";
import { ExportButton, ExportDialog } from "./ExportDialog.tsx";
import { NewPageDialog } from "./NewPageDialog.tsx";

/** W-978: why a row matches when only its content does. */
export function FoundIn({
  query,
  text,
  fields,
}: {
  query: string;
  text: string | undefined;
  fields: string[];
}) {
  const snippet = contentSnippet(query, text, ...fields);
  return snippet ? (
    <div className="emvb-row-found" data-emvb-found-in="">
      Found in content: {snippet}
    </div>
  ) : null;
}

/** The Visual pages list (IA): title and slug, status, last edited; New page. */
export function PageList({ fetcher }: { fetcher: Fetcher }) {
  const list = useList(fetcher, listPages);
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const searchRef = React.useRef<HTMLInputElement>(null);
  const shown =
    list.state === "ready"
      ? list.items.filter((page) =>
          // W-978: titles, addresses and the words on the page.
          matchesSearch(query, page.title, `/${page.slug}`, page.text ?? ""),
        )
      : [];
  const selection = useSelection(list.state === "ready" ? list.items.map((p) => p.id) : []);
  const [exportIds, setExportIds] = React.useState<string[]>([]);
  const titles = new Map(list.state === "ready" ? list.items.map((p) => [p.id, p.title]) : []);

  const newPage = (
    <div className="emvb-list-actions">
      {list.state === "ready" && list.items.length > 0 && (
        <ExportButton onClick={() => setExporting(true)} />
      )}
      <ImportButton onClick={() => setImporting(true)} />
      <NewButton label="New page" onClick={() => setCreating(true)} />
    </div>
  );

  return (
    <>
      <div className="emvb-list-header">
        <h1 className="emvb-page-title">Pages VisualBuilder</h1>
        {list.state === "ready" && list.items.length > 0 && newPage}
      </div>
      {list.state === "loading" && <ListLoading label="Loading pages…" />}
      {list.state === "error" && (
        <ListError title="Couldn't load your pages" message={list.message} onRetry={list.retry} />
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
        <ListSearch value={query} onChange={setQuery} label="Search pages" inputRef={searchRef} />
      )}
      <BulkBar
        fetcher={fetcher}
        collection={PAGES_COLLECTION}
        selection={selection}
        titles={titles}
        noun="page"
        nouns="pages"
        onChanged={list.retry}
        onExport={(ids) => {
          setExportIds(ids);
          setExporting(true);
        }}
      />
      {list.state === "ready" && list.items.length > 0 && shown.length === 0 && (
        <NoMatches
          query={query}
          onClear={() => {
            setQuery("");
            searchRef.current?.focus();
          }}
        />
      )}
      {list.state === "ready" && shown.length > 0 && (
        <div className="emvb-surface-card" data-emvb-list="pages">
          <Table data-emvb-list="pages">
            <Table.Header>
              <Table.Row>
                <Table.Head className="emvb-row-select">
                  <SelectAll shown={shown.map((p) => p.id)} selection={selection} noun="pages" />
                </Table.Head>
                <Table.Head>Title</Table.Head>
                <Table.Head>Status</Table.Head>
                <Table.Head>Last edited</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {shown.map((page) => (
                <Table.Row key={page.id} data-emvb-row={page.id}>
                  <Table.Cell className="emvb-row-select">
                    <SelectRow id={page.id} title={page.title} selection={selection} />
                  </Table.Cell>
                  <Table.Cell>
                    <a className="emvb-row-title" href={editorUrl(page.id)}>
                      {page.title}
                    </a>
                    <div className="emvb-row-slug">/{page.slug}</div>
                    <FoundIn
                      query={query}
                      text={page.text}
                      fields={[page.title, `/${page.slug}`]}
                    />
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
      <ExportDialog
        fetcher={fetcher}
        open={exporting}
        onOpenChange={(open) => {
          setExporting(open);
          if (!open) setExportIds([]);
        }}
        pages={list.state === "ready" ? list.items : []}
        selectedIds={exportIds}
      />
      <ImportElementorDialog
        fetcher={fetcher}
        open={importing}
        onOpenChange={setImporting}
        target="page"
      />
    </>
  );
}
