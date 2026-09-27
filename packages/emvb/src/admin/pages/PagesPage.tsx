import { Banner, Button, Empty, Loader } from "@cloudflare/kumo";
import { LayoutIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { RequireEditor } from "../access/RequireEditor.tsx";
import { defaultFetcher, type Fetcher } from "../api.ts";
import { useSetupStatus } from "../setup/useSetupStatus.ts";
import { BUTTON, SOLID_PRIMARY, UI_CSS } from "../ui.ts";
import { PageList } from "./PageList.tsx";

/** "Visual pages" (`/pages`): setup states, then the page list. */
export function PagesPage({ fetcher = defaultFetcher }: { fetcher?: Fetcher }) {
  return (
    <RequireEditor fetcher={fetcher}>
      {(role) => <PagesHome fetcher={fetcher} role={role} />}
    </RequireEditor>
  );
}

const PAGES_CSS = `${UI_CSS}
.emvb-pages { display: flex; flex-direction: column; gap: 12px; }
.emvb-list-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.emvb-page-title { margin: 0; font-size: 24px; line-height: 1.25; font-weight: 600; }
.emvb-row-title { color: var(--text-color-kumo-default); font-size: 14px; line-height: 20px; text-decoration: none; }
.emvb-row-title:hover { text-decoration: underline; }
.emvb-row-title:focus-visible { outline: 2px solid var(--color-kumo-brand); outline-offset: 2px; border-radius: 4px; }
.emvb-row-slug { font-family: var(--font-mono); font-size: 12px; line-height: 16px; color: var(--text-color-kumo-subtle); }
.emvb-tabular { font-variant-numeric: tabular-nums; }
`;

function PagesHome({ fetcher, role }: { fetcher: Fetcher; role: number }) {
  const { status, running, setup } = useSetupStatus(fetcher, role);

  if (status.state === "loading") return <Loader />;
  if (status.state === "error") {
    return (
      <Banner
        variant="error"
        icon={<WarningCircleIcon aria-hidden="true" />}
        title="Couldn't load Visual pages"
        description={status.message}
      />
    );
  }
  const action = (label: string) =>
    status.isAdmin ? (
      <Button
        variant="primary"
        className={BUTTON}
        style={SOLID_PRIMARY}
        loading={running}
        onClick={() => void setup()}
      >
        {label}
      </Button>
    ) : undefined;

  return (
    <section data-emvb-page="pages" className="emvb-pages">
      <style>{PAGES_CSS}</style>
      {status.state !== "ready" && <h1 className="emvb-page-title">Visual pages</h1>}
      {status.state === "missing" && (
        <Empty
          icon={<LayoutIcon size={32} aria-hidden="true" />}
          title="EmVB isn't set up yet"
          description={
            status.isAdmin
              ? "Setup creates the collection EmVB stores its pages in."
              : "Ask an administrator to set up EmVB."
          }
          contents={action("Set up EmVB")}
        />
      )}
      {status.state === "outdated" && (
        <Banner
          variant="alert"
          title="EmVB needs to update its page collection"
          description={
            status.conflicts.length > 0
              ? status.conflicts.join(" ")
              : status.isAdmin
                ? "Upgrading adds or corrects EmVB's fields. Existing pages are kept."
                : "Ask an administrator to upgrade EmVB."
          }
          action={status.conflicts.length > 0 ? undefined : action("Upgrade EmVB")}
        />
      )}
      {status.state === "ready" && (
        <div data-emvb-setup="ready" className="emvb-pages">
          <PageList fetcher={fetcher} />
        </div>
      )}
    </section>
  );
}
