import { Button, Dialog, Input, Select } from "@cloudflare/kumo";
import * as React from "react";
import { slugify } from "../../core/index.ts";
import { THEME_PARTS_COLLECTION } from "../../constants.ts";
import { ApiError, type Fetcher } from "../api.ts";
import { createThemePart } from "../theme-api.ts";
import { editorUrl } from "../editor/exit.ts";
import { slugTakenMessage } from "../editor/useSave.ts";
import { BUTTON, FIELD, SOLID_PRIMARY } from "../ui.ts";

const TYPES = [
  { value: "header", label: "Header" },
  { value: "footer", label: "Footer" },
] as const;

/** New theme part: type + title, then open the shared editor. */
export function NewThemePartDialog({
  fetcher,
  open,
  onOpenChange,
}: {
  fetcher: Fetcher;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [partType, setPartType] = React.useState<"header" | "footer">("header");
  const [title, setTitle] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugEdited, setSlugEdited] = React.useState(false);
  const [error, setError] = React.useState<{ field: "title" | "slug" | "form"; message: string }>();
  const [busy, setBusy] = React.useState(false);

  const create = async () => {
    const cleanTitle = title.trim();
    const cleanSlug = slugify(slug);
    if (!cleanTitle) return setError({ field: "title", message: "Enter a title." });
    if (!cleanSlug) {
      return setError({ field: "slug", message: "Enter a slug using letters, digits or -." });
    }
    setError(undefined);
    setBusy(true);
    try {
      const id = await createThemePart(fetcher, {
        title: cleanTitle,
        slug: cleanSlug,
        partType,
      });
      window.location.assign(editorUrl(id, THEME_PARTS_COLLECTION));
    } catch (failure) {
      setBusy(false);
      if (failure instanceof ApiError && failure.code === "SLUG_CONFLICT") {
        setError({ field: "slug", message: slugTakenMessage(cleanSlug) });
      } else {
        setError({
          field: "form",
          message:
            failure instanceof ApiError
              ? `Couldn't create the theme part. ${failure.message}`
              : "Couldn't create the theme part. Check your connection and try again.",
        });
      }
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="base" className="p-6">
        <form
          data-emvb-dialog="new-theme-part"
          className="emvb-dialog"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <Dialog.Title>New theme part</Dialog.Title>
          <Select
            label="Type"
            className={FIELD}
            value={partType}
            onValueChange={(value) => setPartType(value === "footer" ? "footer" : "header")}
            renderValue={(value: unknown) =>
              TYPES.find((option) => option.value === value)?.label ?? String(value)
            }
          >
            {TYPES.map((option) => (
              <Select.Option key={option.value} value={option.value}>
                {option.label}
              </Select.Option>
            ))}
          </Select>
          <Input
            label="Title"
            className={FIELD}
            autoFocus
            value={title}
            error={error?.field === "title" ? error.message : undefined}
            onChange={(event) => {
              setTitle(event.target.value);
              if (!slugEdited) setSlug(slugify(`${partType}-${event.target.value}`));
            }}
          />
          <Input
            label="Slug"
            className={`${FIELD} emvb-mono`}
            value={slug}
            description="Internal id only — theme parts are not public URLs."
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
              Create
            </Button>
          </div>
        </form>
      </Dialog>
    </Dialog.Root>
  );
}
