import { Button, Dialog, Input } from "@cloudflare/kumo";
import { PlusIcon } from "@phosphor-icons/react";
import * as React from "react";
import { pageSlug } from "../../core/index.ts";
import { ApiError } from "../api.ts";
import { slugTakenMessage } from "../editor/useSave.ts";
import { useMediaQuery } from "../editor/useMediaQuery.ts";
import { BUTTON, FIELD, SOLID_PRIMARY, UI_CSS } from "../ui.ts";

type FieldError = { field: "title" | "slug" | "form"; message: string };

/** Why creating failed: a taken slug belongs to the slug field, anything else to the form. */
function createFailure(failure: unknown, noun: string, slug: string): FieldError {
  if (failure instanceof ApiError && failure.code === "SLUG_CONFLICT") {
    return { field: "slug", message: slugTakenMessage(slug) };
  }
  return {
    field: "form",
    message:
      failure instanceof ApiError
        ? `Couldn't create the ${noun}. ${failure.message}`
        : `Couldn't create the ${noun}. Check your connection and try again.`,
  };
}

/**
 * The New page / New theme part form (IA): title, a slug that follows `slugPrefix` + title until
 * edited, then `create` returns the editor URL to open. `children` go above the title.
 */
export function CreateDialog({
  name,
  heading,
  noun,
  emptyTitle,
  slugPrefix = "",
  slugHint,
  submitLabel,
  create,
  open,
  onOpenChange,
  children,
}: {
  name: string;
  heading: string;
  noun: string;
  emptyTitle: string;
  slugPrefix?: string;
  slugHint: string;
  submitLabel: string;
  create: (title: string, slug: string) => Promise<string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children?: React.ReactNode;
}) {
  const [title, setTitle] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugEdited, setSlugEdited] = React.useState(false);
  const [error, setError] = React.useState<FieldError>();
  const [busy, setBusy] = React.useState(false);
  const pending = React.useRef(false);
  // Native autofocus can run before Kumo records its return-focus target.
  const opener = React.useRef<HTMLElement | null>(null);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  // A new prefix (theme part type) re-derives an untouched slug for the title typed so far.
  const titleRef = React.useRef(title);
  titleRef.current = title;
  const slugEditedRef = React.useRef(slugEdited);
  slugEditedRef.current = slugEdited;
  React.useEffect(() => {
    if (!slugEditedRef.current && titleRef.current) {
      setSlug(pageSlug(`${slugPrefix}${titleRef.current}`));
    }
  }, [slugPrefix]);

  const submit = async () => {
    if (pending.current) return;
    const cleanTitle = title.trim();
    const cleanSlug = pageSlug(slug);
    if (!cleanTitle) return setError({ field: "title", message: emptyTitle });
    if (!cleanSlug) {
      return setError({ field: "slug", message: "Enter a slug using letters, digits or -." });
    }
    setError(undefined);
    pending.current = true;
    setBusy(true);
    try {
      window.location.assign(await create(cleanTitle, cleanSlug));
    } catch (failure) {
      pending.current = false;
      setBusy(false);
      setError(createFailure(failure, noun, cleanSlug));
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && pending.current) return;
        onOpenChange(next);
      }}
      onOpenChangeComplete={(next) => {
        if (next) return;
        const target = opener.current;
        opener.current = null;
        if (target?.isConnected) target.focus({ preventScroll: true });
      }}
    >
      <Dialog size="base" className="p-6">
        <style>{UI_CSS}</style>
        <form
          data-emvb-dialog={name}
          className="emvb-dialog"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Dialog.Title>{heading}</Dialog.Title>
          <fieldset className="emvb-create-fields" disabled={busy}>
            {children}
            <Input
              label="Title"
              className={FIELD}
              autoFocus
              onFocus={(event) => {
                const previous = event.relatedTarget;
                if (
                  !opener.current &&
                  previous instanceof HTMLElement &&
                  !event.currentTarget.closest('[role="dialog"]')?.contains(previous)
                ) {
                  opener.current = previous;
                }
              }}
              value={title}
              error={error?.field === "title" ? error.message : undefined}
              onChange={(event) => {
                setTitle(event.target.value);
                if (!slugEdited) setSlug(pageSlug(`${slugPrefix}${event.target.value}`));
              }}
            />
            <Input
              label="Slug"
              className={`${FIELD} emvb-mono`}
              value={slug}
              description={slugHint}
              error={error?.field === "slug" ? error.message : undefined}
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(event.target.value);
              }}
            />
          </fieldset>
          {error?.field === "form" && (
            <p className="emvb-inline-error" role="alert">
              {error.message}
            </p>
          )}
          <p
            className="emvb-create-status"
            role="status"
            aria-label="Creation status"
            aria-live="polite"
          >
            {busy ? `Creating ${noun}…` : ""}
          </p>
          <div className="emvb-dialog-actions">
            <Dialog.Close
              render={(props) => (
                <Button {...props} variant="secondary" className={BUTTON} disabled={busy}>
                  Cancel
                </Button>
              )}
            />
            <Button
              type="submit"
              variant="primary"
              className={BUTTON}
              style={SOLID_PRIMARY}
              icon={<PlusIcon size={14} aria-hidden="true" />}
              loading={busy && !reducedMotion}
              disabled={busy}
              aria-busy={busy}
            >
              {submitLabel}
            </Button>
          </div>
        </form>
      </Dialog>
    </Dialog.Root>
  );
}
