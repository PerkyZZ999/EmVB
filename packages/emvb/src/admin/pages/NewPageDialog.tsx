import { starterLayout } from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { createPage } from "../content-api.ts";
import { editorUrl } from "../editor/exit.ts";
import { CreateDialog } from "./CreateDialog.tsx";

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
  return (
    <CreateDialog
      name="new-page"
      heading="New page"
      noun="page"
      emptyTitle="Enter a title for the page."
      slugHint="The page's address on your site."
      submitLabel="Create page"
      open={open}
      onOpenChange={onOpenChange}
      create={async (title, slug) =>
        editorUrl(await createPage(fetcher, { title, slug, layout: starterLayout(title) }))
      }
    />
  );
}
