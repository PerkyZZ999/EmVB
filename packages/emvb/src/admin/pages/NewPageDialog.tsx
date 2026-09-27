import { Button, Dialog, Input } from "@cloudflare/kumo";
import * as React from "react";
import { slugify, starterLayout } from "../../core/index.ts";
import { ApiError, type Fetcher } from "../api.ts";
import { createPage } from "../content-api.ts";
import { editorUrl } from "../editor/exit.ts";
import { slugTakenMessage } from "../editor/useSave.ts";
import { BUTTON, FIELD, SOLID_PRIMARY, UI_CSS } from "../ui.ts";

/** New page (IA): title, auto-filled editable slug, then straight into the editor. */
export function NewPageDialog({
  fetcher,
  open,
  onOpenChange,
}: {
  fetcher: Fetcher;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugEdited, setSlugEdited] = React.useState(false);
  const [error, setError] = React.useState<{ field: "title" | "slug" | "form"; message: string }>();
  const [busy, setBusy] = React.useState(false);

  const create = async () => {
    const cleanTitle = title.trim();
    const cleanSlug = slugify(slug);
    if (!cleanTitle) return setError({ field: "title", message: "Enter a title for the page." });
    if (!cleanSlug) {
      return setError({ field: "slug", message: "Enter a slug using letters, digits or -." });
    }
    setError(undefined);
    setBusy(true);
    try {
      const id = await createPage(fetcher, {
        title: cleanTitle,
        slug: cleanSlug,
        layout: starterLayout(cleanTitle),
      });
      window.location.assign(editorUrl(id));
    } catch (failure) {
      setBusy(false);
      if (failure instanceof ApiError && failure.code === "SLUG_CONFLICT") {
        setError({ field: "slug", message: slugTakenMessage(cleanSlug) });
      } else {
        setError({
          field: "form",
          message:
            failure instanceof ApiError
              ? `Couldn't create the page. ${failure.message}`
              : "Couldn't create the page. Check your connection and try again.",
        });
      }
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="base" className="p-6">
        <style>{UI_CSS}</style>
        <form
          data-emvb-dialog="new-page"
          className="emvb-dialog"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <Dialog.Title>New page</Dialog.Title>
          <Input
            label="Title"
            className={FIELD}
            autoFocus
            value={title}
            error={error?.field === "title" ? error.message : undefined}
            onChange={(event) => {
              setTitle(event.target.value);
              if (!slugEdited) setSlug(slugify(event.target.value));
            }}
          />
          <Input
            label="Slug"
            className={`${FIELD} emvb-mono`}
            value={slug}
            description="The page's address on your site."
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
              Create page
            </Button>
          </div>
        </form>
      </Dialog>
    </Dialog.Root>
  );
}
