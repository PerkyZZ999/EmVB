import { Button, Dialog, Loader } from "@cloudflare/kumo";
import * as React from "react";
import { BUTTON, FIELD, SOLID_PRIMARY, UI_CSS } from "../ui.ts";
import { DialogCloseButton } from "./DialogCloseButton.tsx";
import { useEditedNoun } from "./edited-noun.ts";
import { useMediaQuery } from "./useMediaQuery.ts";

/** W-1027: a date and time as people read it here: "14 Nov 2026, 09:00". */
export const scheduleLabel = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );

const pad = (n: number) => String(n).padStart(2, "0");

/** The visitor's time zone name, such as America/Toronto. */
const timeZone = () => new Intl.DateTimeFormat().resolvedOptions().timeZone;

const systemNow = () => new Date();

/** A local time as a datetime-local input's value. */
export function localInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Tomorrow at 9:00, local time: the first suggestion. */
function tomorrowMorning(now: Date): Date {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  return next;
}

/**
 * W-1027: Schedule publish. EmDash publishes the saved draft at the chosen time; until then the
 * page stays as it is (a draft, or its published version). Unsaved edits are saved first. When
 * a time is set, the dialog shows it and can change or cancel it.
 */
export function ScheduleDialog({
  open,
  onOpenChange,
  scheduledAt,
  onSchedule,
  now = systemNow,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduledAt: string | null;
  /** Schedules at a time, or with null cancels; resolves to an error message or null. */
  onSchedule: (at: Date | null) => Promise<string | null>;
  /** Test seam. */
  now?: () => Date;
}) {
  const noun = useEditedNoun();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const id = React.useId();
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<"schedule" | "cancel" | null>(null);
  const [wasOpen, setWasOpen] = React.useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValue(localInputValue(scheduledAt ? new Date(scheduledAt) : tomorrowMorning(now())));
      setError(null);
      setBusy(null);
    }
  }
  const zone = timeZone();

  const run = async (kind: "schedule" | "cancel") => {
    if (busy) return;
    let at: Date | null = null;
    if (kind === "schedule") {
      at = value ? new Date(value) : null;
      if (!at || Number.isNaN(at.getTime())) {
        setError("Choose a date and a time.");
        return;
      }
      if (at.getTime() <= now().getTime() + 60_000) {
        setError("Choose a time at least a minute from now.");
        return;
      }
    }
    setBusy(kind);
    setError(null);
    const failure = await onSchedule(at);
    setBusy(null);
    if (failure) setError(failure);
    else onOpenChange(false);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && busy) return;
        onOpenChange(next);
      }}
    >
      <Dialog size="base" className="p-6">
        <style>{UI_CSS}</style>
        <form
          data-emvb-dialog="schedule"
          className="emvb-dialog"
          onSubmit={(event) => {
            event.preventDefault();
            void run("schedule");
          }}
        >
          <Dialog.Title>Schedule publishing</Dialog.Title>
          <Dialog.Description>
            {scheduledAt
              ? `This ${noun} publishes on ${scheduleLabel(scheduledAt)}. Change the time or cancel it.`
              : `Choose when this ${noun} goes live. Your saved changes publish then; until then visitors see what is live now.`}
          </Dialog.Description>
          <label className="emvb-field-label" htmlFor={id}>
            Publish on
          </label>
          <input
            id={id}
            type="datetime-local"
            className={FIELD}
            value={value}
            min={localInputValue(now())}
            aria-describedby={`${id}-zone${error ? ` ${id}-error` : ""}`}
            aria-invalid={error ? true : undefined}
            onChange={(event) => setValue(event.currentTarget.value)}
          />
          <p className="emvb-helper" id={`${id}-zone`}>
            Time zone: {zone}.
          </p>
          {error && (
            <p className="emvb-inline-error" role="alert" id={`${id}-error`}>
              {error}
            </p>
          )}
          <div className="emvb-dialog-actions">
            <DialogCloseButton>Close</DialogCloseButton>
            {scheduledAt && (
              <Button
                variant="secondary"
                className={BUTTON}
                aria-disabled={busy !== null}
                aria-busy={busy === "cancel"}
                onClick={() => void run("cancel")}
              >
                Cancel schedule
              </Button>
            )}
            <Button
              type="submit"
              variant="primary"
              className={BUTTON}
              style={SOLID_PRIMARY}
              aria-disabled={busy !== null}
              aria-busy={busy === "schedule"}
              icon={busy === "schedule" && !reducedMotion ? <Loader size={14} /> : undefined}
            >
              {scheduledAt ? "Change schedule" : "Schedule"}
            </Button>
          </div>
        </form>
      </Dialog>
    </Dialog.Root>
  );
}
