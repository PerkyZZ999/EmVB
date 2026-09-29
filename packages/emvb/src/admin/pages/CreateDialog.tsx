import { Button, Dialog, Input } from "@cloudflare/kumo";
import * as React from "react";
import { slugify } from "../../core/index.ts";
import { ApiError } from "../api.ts";
import { slugTakenMessage } from "../editor/useSave.ts";
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

  // A new prefix (theme part type) re-derives an untouched slug for the title typed so far.
  const titleRef = React.useRef(title);
  titleRef.current = title;
  const slugEditedRef = React.useRef(slugEdited);
  slugEditedRef.current = slugEdited;
  React.useEffect(() => {
    if (!slugEditedRef.current && titleRef.current) {
      setSlug(slugify(`${slugPrefix}${titleRef.current}`));
    }
  }, [slugPrefix]);

  const submit = async () => {
    const cleanTitle = title.trim();
    const cleanSlug = slugify(slug);
    if (!cleanTitle) return setError({ field: "title", message: emptyTitle });
    if (!cleanSlug) {
      return setError({ field: "slug", message: "Enter a slug using letters, digits or -." });
    }
    setError(undefined);
    setBusy(true);
    try {
      window.location.assign(await create(cleanTitle, cleanSlug));
    } catch (failure) {
      setBusy(false);
      setError(createFailure(failure, noun, cleanSlug));
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
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
          {children}
          <Input
            label="Title"
            className={FIELD}
            autoFocus
            value={title}
            error={error?.field === "title" ? error.message : undefined}
            onChange={(event) => {
              setTitle(event.target.value);
              if (!slugEdited) setSlug(slugify(`${slugPrefix}${event.target.value}`));
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
          {error?.field === "form" && (
            <p className="emvb-inline-error" role="alert">
              {error.message}
            </p>
          )}
          <div className="emvb-dialog-actions">
            <Dialog.Close
              render={(props) => (
                <Button {...props} variant="secondary" className={BUTTON}>
                  Cancel
                </Button>
              )}
            />
            <Button
              type="submit"
              variant="primary"
              className={BUTTON}
              style={SOLID_PRIMARY}
              loading={busy}
            >
              {submitLabel}
            </Button>
          </div>
        </form>
      </Dialog>
    </Dialog.Root>
  );
}
