import { Select } from "@cloudflare/kumo";
import * as React from "react";
import { layoutFromPageTemplate, starterLayout } from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { createPage } from "../content-api.ts";
import { editorUrl } from "../editor/exit.ts";
import { listThemeParts, themePartLayout, type ThemePartSummary } from "../theme-api.ts";
import { FIELD } from "../ui.ts";
import { CreateDialog } from "./CreateDialog.tsx";

const NONE = "__none__";

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
  const [templateId, setTemplateId] = React.useState("");
  const [templates, setTemplates] = React.useState<ThemePartSummary[]>([]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listThemeParts(fetcher)
      .then((all) => {
        if (!cancelled) setTemplates(all.filter((part) => part.partType === "page_template"));
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, fetcher]);

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
      create={async (title, slug) => {
        let layout = starterLayout(title);
        if (templateId) {
          const source = await themePartLayout(fetcher, templateId, "page_template");
          if (source) layout = layoutFromPageTemplate(source);
        }
        return editorUrl(await createPage(fetcher, { title, slug, layout }));
      }}
    >
      {templates.length > 0 ? (
        <Select
          label="Page template"
          className={FIELD}
          value={templateId || NONE}
          onValueChange={(next) => {
            if (!next || next === NONE) {
              setTemplateId("");
              return;
            }
            setTemplateId(next);
          }}
        >
          <Select.Option value={NONE}>Blank page</Select.Option>
          {templates.map((part) => (
            <Select.Option key={part.id} value={part.id}>
              {part.title}
            </Select.Option>
          ))}
        </Select>
      ) : null}
    </CreateDialog>
  );
}
