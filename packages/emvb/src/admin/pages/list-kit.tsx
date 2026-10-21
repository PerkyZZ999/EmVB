import { Banner, Button, Input, SkeletonLine } from "@cloudflare/kumo";
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
  const [attempt, setAttempt] = React.useState(0);
  const retry = React.useCallback(() => setAttempt((value) => value + 1), []);
  React.useEffect(() => {
    let active = true;
    setList({ state: "loading" });
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
  }, [fetcher, load, attempt]);
  return { ...list, retry };
}

/**
 * W-837: Retry swaps the error for a loading card and then the list, so the focused Retry button
 * vanished and focus fell to the page body. A Retry press leaves a short-lived note; the loading
 * card, a fresh error's Retry, or the list's New button takes focus when it mounts.
 */
let retryPressedAt = 0;
const RETRY_FOCUS_MS = 15_000;
function useRetryLanding<T extends HTMLElement>(ref: React.RefObject<T | null>, last: boolean) {
  React.useEffect(() => {
    if (Date.now() - retryPressedAt > RETRY_FOCUS_MS) return;
    if (last) retryPressedAt = 0;
    ref.current?.focus({ preventScroll: true });
  }, [ref, last]);
}

export function NewButton({ label, onClick }: { label: string; onClick: () => void }) {
  const ref = React.useRef<HTMLButtonElement>(null);
  useRetryLanding(ref, true);
  return (
    <Button
      ref={ref}
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

export function ListLoading({ label }: { label: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  useRetryLanding(ref, false);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="emvb-surface-card emvb-list-loading"
      role="status"
      aria-label={label}
    >
      <p className="emvb-helper">{label}</p>
      <div className="emvb-list-skeleton-rows" aria-hidden="true">
        {[0, 1, 2].map((row) => (
          <div className="emvb-list-skeleton-row" key={row}>
            <div className="emvb-list-skeleton-title">
              <SkeletonLine minWidth={80} maxWidth={80} blockHeight={20} />
              <SkeletonLine minWidth={55} maxWidth={55} blockHeight={16} />
            </div>
            <SkeletonLine minWidth={65} maxWidth={65} />
            <SkeletonLine minWidth={75} maxWidth={75} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A named, motion-free status for short checks that have no list shape to sketch (UX-012). */
export function LoadingStatus({ label }: { label: string }) {
  return (
    <p className="emvb-helper emvb-loading-status" role="status">
      {label}
    </p>
  );
}

export function ListError({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  const ref = React.useRef<HTMLButtonElement>(null);
  useRetryLanding(ref, true);
  return (
    <Banner
      role="alert"
      variant="error"
      icon={<WarningCircleIcon aria-hidden="true" />}
      title={title}
      description={message}
      action={
        <Button
          ref={ref}
          type="button"
          variant="secondary"
          className={BUTTON}
          onClick={() => {
            retryPressedAt = Date.now();
            onRetry();
          }}
        >
          Retry
        </Button>
      }
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

/** W-685: a time the browser can't read showed "Invalid time value" by throwing, which blanked the list. */
const readableTime = (iso: string) => {
  const time = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(time) ? "" : formatter.format(time);
};

export function EditedTime({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={iso} className="emvb-tabular">
      {readableTime(iso)}
    </time>
  );
}

/** The search box above a list (W-207). */
export function ListSearch({
  value,
  onChange,
  label,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  inputRef: React.Ref<HTMLInputElement>;
}) {
  return (
    <div className="emvb-list-search">
      <Input
        ref={inputRef}
        type="search"
        id="emvb-list-search"
        aria-label={label}
        placeholder={label}
        value={value}
        maxLength={200}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/** Shown when a search finds nothing (W-207). */
export function NoMatches({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="emvb-surface-card">
      <p className="emvb-helper" role="status" data-emvb-no-matches>
        Nothing matches "{query.trim()}".
      </p>
      <Button type="button" variant="secondary" className={BUTTON} onClick={onClear}>
        Clear search
      </Button>
    </div>
  );
}
