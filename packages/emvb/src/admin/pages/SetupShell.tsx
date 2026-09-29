import { Banner, Button, Empty, Loader } from "@cloudflare/kumo";
import { LayoutIcon, WarningCircleIcon } from "@phosphor-icons/react";
import * as React from "react";
import type { Fetcher } from "../api.ts";
import { useSetupStatus } from "../setup/useSetupStatus.ts";
import { BUTTON, SOLID_PRIMARY, UI_CSS } from "../ui.ts";

/**
 * Shared setup chrome for the plugin's admin pages: loading/error states, the set-up and upgrade
 * prompts, and the ready wrapper (`data-emvb-setup="ready"`). Page content goes in `children`.
 */
export function SetupShell({
  fetcher,
  role,
  page,
  title,
  keptNote,
  children,
}: {
  fetcher: Fetcher;
  role: number;
  /** The `data-emvb-page` value (`pages`, `theme`). */
  page: string;
  title: string;
  /** The outdated-banner reassurance line ("Existing pages are kept." / "Existing content is kept."). */
  keptNote: string;
  children: React.ReactNode;
}) {
  const { status, running, setup } = useSetupStatus(fetcher, role);

  if (status.state === "loading") return <Loader />;
  if (status.state === "error") {
    return (
      <Banner
        variant="error"
        icon={<WarningCircleIcon aria-hidden="true" />}
        title={`Couldn't load ${title}`}
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
    <section data-emvb-page={page} className="emvb-pages">
      <style>{UI_CSS}</style>
      {status.state !== "ready" && <h1 className="emvb-page-title">{title}</h1>}
      {status.state === "missing" && (
        <div className="emvb-surface-card emvb-empty-shell">
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
        </div>
      )}
      {status.state === "outdated" && (
        <Banner
          variant="alert"
          title="EmVB needs to update its collections"
          description={
            status.conflicts.length > 0
              ? status.conflicts.join(" ")
              : status.isAdmin
                ? `Upgrading adds or corrects EmVB's fields. ${keptNote}`
                : "Ask an administrator to upgrade EmVB."
          }
          action={status.conflicts.length > 0 ? undefined : action("Upgrade EmVB")}
        />
      )}
      {status.state === "ready" && children}
    </section>
  );
}
