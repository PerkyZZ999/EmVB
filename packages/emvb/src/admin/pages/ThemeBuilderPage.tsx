import { Banner, Button, Empty, Loader } from "@cloudflare/kumo";
import { LayoutIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { RequireEditor } from "../access/RequireEditor.tsx";
import { defaultFetcher, type Fetcher } from "../api.ts";
import { useSetupStatus } from "../setup/useSetupStatus.ts";
import { BUTTON, SOLID_PRIMARY, UI_CSS } from "../ui.ts";
import { ThemePartList } from "./ThemePartList.tsx";

/** Theme Builder (`/theme`): setup states, then the theme parts list. */
export function ThemeBuilderPage({ fetcher = defaultFetcher }: { fetcher?: Fetcher }) {
  return (
    <RequireEditor fetcher={fetcher}>
      {(role) => <ThemeBuilderHome fetcher={fetcher} role={role} />}
    </RequireEditor>
  );
}

function ThemeBuilderHome({ fetcher, role }: { fetcher: Fetcher; role: number }) {
  const { status, running, setup } = useSetupStatus(fetcher, role);

  if (status.state === "loading") return <Loader />;
  if (status.state === "error") {
    return (
      <Banner
        variant="error"
        icon={<WarningCircleIcon aria-hidden="true" />}
        title="Couldn't load Theme Builder"
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
    <section data-emvb-page="theme" className="emvb-pages">
      <style>{UI_CSS}</style>
      {status.state !== "ready" && <h1 className="emvb-page-title">Theme Builder</h1>}
      {status.state === "missing" && (
        <Empty
          icon={<LayoutIcon size={32} aria-hidden="true" />}
          title="EmVB isn't set up yet"
          description={
            status.isAdmin
              ? "Setup creates the collections EmVB stores its pages and theme parts in."
              : "Ask an administrator to set up EmVB."
          }
          contents={action("Set up EmVB")}
        />
      )}
      {status.state === "outdated" && (
        <Banner
          variant="alert"
          title="EmVB needs to update its collections"
          description={
            status.conflicts.length > 0
              ? status.conflicts.join(" ")
              : status.isAdmin
                ? "Upgrading adds or corrects EmVB's fields. Existing content is kept."
                : "Ask an administrator to upgrade EmVB."
          }
          action={status.conflicts.length > 0 ? undefined : action("Upgrade EmVB")}
        />
      )}
      {status.state === "ready" && (
        <div data-emvb-setup="ready" className="emvb-pages">
          <ThemePartList fetcher={fetcher} />
        </div>
      )}
    </section>
  );
}
