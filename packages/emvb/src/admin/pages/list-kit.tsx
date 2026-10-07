import { Banner, Button } from "@cloudflare/kumo";
import { PlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import * as React from "react";
import type { Fetcher } from "../api.ts";
import { BUTTON, SOLID_PRIMARY } from "../ui.ts";
import { statusLabel } from "../entry-status.ts";

type ListState<T> =
  | { state: "loading" }
  | { state: "ready"; items: T[] }
  | { state: "error"; message: string };

/** Loads a list for `fetcher`, ignoring an answer that arrives after unmount. */
export function useList<T>(fetcher: Fetcher, load: (fetcher: Fetcher) => Promise<T[]>) {
  const [list, setList] = React.useState<ListState<T>>({ state: "loading" });
  React.useEffect(() => {
    let active = true;
    load(fetcher).then(
      (items) => active && setList({ state: "ready", items }),
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
  }, [fetcher, load]);
  return list;
}

export function NewButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      variant="primary"
      className={BUTTON}
      style={SOLID_PRIMARY}
      icon={<PlusIcon aria-hidden="true" />}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

export function ListError({ title, message }: { title: string; message: string }) {
  return (
    <Banner
      variant="error"
      icon={<WarningCircleIcon aria-hidden="true" />}
      title={title}
      description={message}
    />
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className="emvb-status" data-status={status}>
      <span className="emvb-status-dot" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}

const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function EditedTime({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={iso} className="emvb-tabular">
      {iso ? formatter.format(new Date(iso)) : ""}
    </time>
  );
}
