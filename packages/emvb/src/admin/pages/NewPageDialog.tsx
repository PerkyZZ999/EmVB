import { Select } from "@cloudflare/kumo";
import * as React from "react";
import {
  emptyDesign,
  layoutFromPageTemplate,
  PAGE_TEMPLATES,
  starterLayout,
  templatePageLayout,
} from "../../core/index.ts";
import { ApiError, type Fetcher } from "../api.ts";
import { createPage } from "../content-api.ts";
import { editorUrl } from "../editor/exit.ts";
import { loadDesign } from "../editor/useEditorData.ts";
import { listThemeParts, themePartLayout, type ThemePartSummary } from "../theme-api.ts";
import { FIELD } from "../ui.ts";
import { CreateDialog } from "./CreateDialog.tsx";

const NONE = "__none__";
/** W-1068: starter page templates shipped with EmVB are chosen as `starter:<id>`. */
const STARTER = "starter:";
const starterName = (name: string) => `${name} (starter)`;

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
  const starterId = templateId.startsWith(STARTER) ? templateId.slice(STARTER.length) : null;
  const starter = starterId ? PAGE_TEMPLATES.find((page) => page.id === starterId) : undefined;
  const hasUnlistedTemplate =
    templateId !== "" && !starter && !templates.some((part) => part.id === templateId);

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
        if (starter) {
          // The starter takes the site's Site styles; without them it uses neutral fallbacks.
          const design = await loadDesign(fetcher).then(
            (loaded) => loaded.design,
            () => emptyDesign(),
          );
          layout = templatePageLayout(starter.id, design) ?? layout;
        } else if (templateId) {
          const source = await themePartLayout(fetcher, templateId, "page_template");
          if (!source) {
            throw new ApiError(
              409,
              "TEMPLATE_UNAVAILABLE",
              "The selected page template couldn't be loaded. Try again or choose Blank page.",
            );
          }
          layout = layoutFromPageTemplate(source);
        }
        return editorUrl(await createPage(fetcher, { title, slug, layout }));
      }}
    >
      <Select
        label="Page template"
        className={FIELD}
        value={templateId || NONE}
        renderValue={(value: unknown) =>
          !value || value === NONE
            ? "Blank page"
            : (templates.find((part) => part.id === value)?.title ??
              (starter ? starterName(starter.name) : "Previously selected template"))
        }
        onValueChange={(next) => {
          if (!next || next === NONE) {
            setTemplateId("");
            return;
          }
          setTemplateId(next);
        }}
      >
        <Select.Option value={NONE}>Blank page</Select.Option>
        {PAGE_TEMPLATES.map((page) => (
          <Select.Option key={page.id} value={`${STARTER}${page.id}`}>
            {starterName(page.name)}
          </Select.Option>
        ))}
        {hasUnlistedTemplate && (
          <Select.Option value={templateId}>Previously selected template</Select.Option>
        )}
        {templates.map((part) => (
          <Select.Option key={part.id} value={part.id}>
            {part.title}
          </Select.Option>
        ))}
      </Select>
    </CreateDialog>
  );
}
