import { Badge, Banner, Button, Empty, Loader, Table } from "@cloudflare/kumo";
import {
  CodeIcon,
  DatabaseIcon,
  LockKeyIcon,
  PlusIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useRole } from "../access/role.ts";
import { defaultFetcher, type Fetcher } from "../api.ts";
import {
  addCanvasField,
  canvasCollectionsSnippet,
  loadHostCollections,
  type HostCollectionRow,
} from "../setup/host-collections.ts";
import { BUTTON, UI_CSS } from "../ui.ts";
import { CopySnippet, SCROLLABLE, SectionHead } from "./AgentsPage.tsx";
import { ListError, ListLoading } from "./list-kit.tsx";

const ADMIN_ROLE = 50;

const PAGE_CSS = `
.emvb-collections-table td:last-child, .emvb-collections-table th:last-child { text-align: end; }
.emvb-collections-slug { display: block; font-size: 12px; color: var(--text-color-kumo-subtle); font-family: var(--font-mono); }
`;

function shell(body: ReactNode, status = "ready") {
  return (
    <div className="emvb-pages emvb-agents" data-emvb-collections={status}>
      <style data-emvb-ui="">{UI_CSS}</style>
      <style>{PAGE_CSS}</style>
      <div className="emvb-agents-header">
        <div>
          <h1 className="emvb-page-title">Host collections</h1>
          <p>
            Let entries in your own collections hold an EmVB layout, edited with Edit with EmVB.
          </p>
        </div>
      </div>
      {body}
    </div>
  );
}

function FieldBadge({ row }: { row: HostCollectionRow }) {
  if (row.field === "ready") return <Badge variant="blue">Has {row.fieldSlug}</Badge>;
  if (row.field === "taken") return <Badge variant="neutral">"canvas" is another field</Badge>;
  return <Badge variant="neutral">No canvas field</Badge>;
}

/**
 * Host collections (`/collections`, W-913): which collections can hold an EmVB layout, a button
 * that adds the `emvb:canvas` field through EmDash's schema API, and the `canvasCollections`
 * snippet. That option lives in astro.config and is read at start-up, so setup can't change it.
 */
export function CollectionsPage({ fetcher = defaultFetcher }: { fetcher?: Fetcher }) {
  const role = useRole(fetcher);
  const isAdmin = role.state === "ready" && role.role >= ADMIN_ROLE;
  const [state, setState] = useState<Awaited<ReturnType<typeof loadHostCollections>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [adding, setAdding] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    loadHostCollections(fetcher)
      .then((next) => !cancelled && setState(next))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [fetcher, isAdmin, attempt]);

  if (role.state === "loading")
    return shell(<ListLoading label="Loading collections…" />, "loading");
  if (!isAdmin) {
    return (
      <section data-emvb-access="denied">
        <Empty
          icon={<LockKeyIcon aria-hidden="true" />}
          title="Only administrators can set up host collections"
          description="Ask an administrator to add the canvas field."
        />
      </section>
    );
  }
  if (error) {
    return shell(
      <ListError
        title="Couldn't load the collections"
        message={error}
        onRetry={() => {
          setError(null);
          setAttempt((n) => n + 1);
        }}
      />,
      "error",
    );
  }
  if (!state) return shell(<ListLoading label="Loading collections…" />, "loading");

  const add = async (slug: string) => {
    setAdding(slug);
    setAddError(null);
    try {
      await addCanvasField(fetcher, slug);
      setState(await loadHostCollections(fetcher));
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(null);
    }
  };
  const snippet = canvasCollectionsSnippet(state.rows, state.canvasStyles);
  const unlisted = state.rows.filter((r) => r.field === "ready" && !r.listed);

  return shell(
    <>
      {addError && (
        <Banner variant="error" icon={<WarningCircleIcon aria-hidden="true" />}>
          The field wasn't added: {addError}
        </Banner>
      )}
      <section className="emvb-surface-card emvb-agents-section" aria-labelledby="emvb-hc-list">
        <SectionHead id="emvb-hc-list" icon={DatabaseIcon} title="Collections">
          Adding the field changes the collection's schema; existing entries keep their content and
          show it until a layout is added.
        </SectionHead>
        {state.rows.length === 0 ? (
          <p>This site has no collections of its own yet.</p>
        ) : (
          <Table className="emvb-collections-table">
            <Table.Header>
              <Table.Row>
                <Table.Head>Collection</Table.Head>
                <Table.Head>Field</Table.Head>
                <Table.Head>In canvasCollections</Table.Head>
                <Table.Head>
                  <span className="sr-only">Action</span>
                </Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {state.rows.map((row) => (
                <Table.Row key={row.slug} data-emvb-collection={row.slug}>
                  <Table.Cell>
                    {row.label}
                    <span className="emvb-collections-slug">{row.slug}</span>
                  </Table.Cell>
                  <Table.Cell>
                    <FieldBadge row={row} />
                  </Table.Cell>
                  <Table.Cell>{row.listed ? "Yes" : "Not yet"}</Table.Cell>
                  <Table.Cell>
                    {row.field === "missing" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className={BUTTON}
                        icon={
                          adding === row.slug ? (
                            <Loader size={14} />
                          ) : (
                            <PlusIcon aria-hidden="true" />
                          )
                        }
                        disabled={adding !== null}
                        aria-label={`Add canvas field to ${row.label}`}
                        onClick={() => void add(row.slug)}
                      >
                        Add canvas field
                      </Button>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </section>
      <section className="emvb-surface-card emvb-agents-section" aria-labelledby="emvb-hc-config">
        <SectionHead id="emvb-hc-config" icon={CodeIcon} title="Site config">
          <code>canvasCollections</code> is an option of <code>emvb()</code> in astro.config, read
          when the site starts, so EmVB can't set it from here. Paste this, then restart or redeploy
          the site.
        </SectionHead>
        {unlisted.length > 0 && (
          <Banner variant="default" data-emvb-unlisted="">
            {unlisted.map((r) => r.label).join(", ")} {unlisted.length === 1 ? "has" : "have"} the
            field but {unlisted.length === 1 ? "isn't" : "aren't"} listed yet: layouts there aren't
            checked on save or rendered until the site config lists{" "}
            {unlisted.length === 1 ? "it" : "them"}.
          </Banner>
        )}
        <div className="emvb-agents-snippet">
          <div className="emvb-agents-snippet-head">
            <h3>astro.config.mjs</h3>
            <CopySnippet text={snippet} name="canvasCollections config" />
          </div>
          <pre data-emvb-snippet="canvas-collections" {...SCROLLABLE} aria-label="Site config">
            {snippet}
          </pre>
        </div>
      </section>
    </>,
  );
}
