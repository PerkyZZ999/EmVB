import { Collapsible, Input, Select, Switch } from "@cloudflare/kumo";
import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import * as React from "react";
import {
  defaultFloatSettings,
  FLOAT_EDGES,
  THEME_PART_TYPE_LABELS,
  type FloatEdge,
} from "../../../core/index.ts";
import type { PageDraft } from "../../content-api.ts";
import { FIELD } from "../../ui.ts";
import type { PagePatch } from "../store.ts";
import { ConditionsEditor } from "./ConditionsEditor.tsx";
import { TriggersEditor } from "./TriggersEditor.tsx";

const LAYOUTS = [
  { value: "site-layout", label: "Site layout" },
  { value: "blank", label: "Blank" },
];

/** Right panel with nothing selected (IA): page settings or theme-part settings. */
export function PageSettings({
  page,
  slugError,
  onChange,
  kind = "page",
}: {
  page: PageDraft;
  slugError: string | null;
  onChange: (patch: PagePatch) => void;
  kind?: "page" | "theme-part";
}) {
  // Hooks run before the theme-part branch, so switching `kind` keeps the hook order (W-092).
  const [seoOpen, setSeoOpen] = React.useState(false);
  if (kind === "theme-part") {
    return (
      <div className="emvb-panel-body" data-emvb-panel="theme-part-settings">
        <h2 className="emvb-panel-title">Theme part settings</h2>
        <Input
          label="Title"
          className={FIELD}
          value={page.title}
          onChange={(event) => onChange({ title: event.target.value })}
        />
        <Input
          label="Type"
          className={FIELD}
          value={THEME_PART_TYPE_LABELS[page.partType ?? "header"]}
          disabled
          description="Chosen when the part was created."
        />
        <ConditionsEditor
          conditions={page.conditions}
          onChange={(conditions) => onChange({ conditions })}
        />
        {page.partType === "popup" && (
          <TriggersEditor
            triggers={page.triggers}
            onChange={(triggers) => onChange({ triggers })}
          />
        )}
        {page.partType === "float" && (
          <FloatSettingsFields
            settings={page.float ?? defaultFloatSettings()}
            onChange={(float) => onChange({ float })}
          />
        )}
      </div>
    );
  }

  const seoCount = (page.seoTitle ? 1 : 0) + (page.seoDescription ? 1 : 0);
  return (
    <div className="emvb-panel-body" data-emvb-panel="page-settings">
      <h2 className="emvb-panel-title">Page settings</h2>
      <Input
        label="Title"
        className={FIELD}
        value={page.title}
        onChange={(event) => onChange({ title: event.target.value })}
      />
      <Input
        label="Slug"
        className={`${FIELD} emvb-mono`}
        value={page.slug}
        error={slugError ?? undefined}
        onChange={(event) => onChange({ slug: event.target.value })}
      />
      <Select
        label="Page layout"
        className={FIELD}
        value={page.canvasMode}
        onValueChange={(value) => onChange({ canvasMode: String(value) })}
        renderValue={(value: unknown) =>
          LAYOUTS.find((option) => option.value === value)?.label ?? String(value)
        }
      >
        {LAYOUTS.map((option) => (
          <Select.Option key={option.value} value={option.value}>
            {option.label}
          </Select.Option>
        ))}
      </Select>
      <Collapsible.Root open={seoOpen} onOpenChange={setSeoOpen}>
        <Collapsible.Trigger className="emvb-section-header" data-emvb-section="seo">
          <span>
            SEO
            {!seoOpen && seoCount > 0 && <span className="emvb-count"> · {seoCount}</span>}
          </span>
          {seoOpen ? (
            <CaretDownIcon size={16} aria-hidden="true" />
          ) : (
            <CaretRightIcon size={16} aria-hidden="true" />
          )}
        </Collapsible.Trigger>
        <Collapsible.Panel className="emvb-section-body">
          <Input
            label="Meta title"
            className={FIELD}
            maxLength={200}
            value={page.seoTitle}
            placeholder={page.title}
            onChange={(event) => onChange({ seoTitle: event.target.value })}
          />
          <p className="emvb-helper">Shown in search results and browser tabs.</p>
          <Input
            label="Meta description"
            className={FIELD}
            maxLength={500}
            value={page.seoDescription}
            onChange={(event) => onChange({ seoDescription: event.target.value })}
          />
        </Collapsible.Panel>
      </Collapsible.Root>
    </div>
  );
}

const FLOAT_EDGE_LABELS: Record<FloatEdge, string> = {
  top: "Top bar",
  bottom: "Bottom bar",
  "start-top": "Corner, top start",
  "end-top": "Corner, top end",
  "start-bottom": "Corner, bottom start",
  "end-bottom": "Corner, bottom end",
};

/** Edge and close button for a Float theme part. The layout itself is the bar or button. */
function FloatSettingsFields({
  settings,
  onChange,
}: {
  settings: NonNullable<PageDraft["float"]>;
  onChange: (settings: NonNullable<PageDraft["float"]>) => void;
}) {
  return (
    <div data-emvb-panel="float">
      <Select
        label="Place"
        className={FIELD}
        value={settings.edge}
        onValueChange={(value) => {
          const edge = FLOAT_EDGES.find((item) => item === value);
          if (edge) onChange({ ...settings, edge });
        }}
        renderValue={(value: unknown) => FLOAT_EDGE_LABELS[value as FloatEdge] ?? String(value)}
      >
        {FLOAT_EDGES.map((edge) => (
          <Select.Option key={edge} value={edge}>
            {FLOAT_EDGE_LABELS[edge]}
          </Select.Option>
        ))}
      </Select>
      <p className="emvb-helper">
        A bar stays on that edge and leaves room for the page. A corner sits over the page.
      </p>
      <Switch
        label="Close button"
        checked={settings.dismiss}
        onCheckedChange={(checked) => onChange({ ...settings, dismiss: checked === true })}
      />
      <p className="emvb-helper">
        Closing hides it until the next visit. Nothing is stored in a cookie.
      </p>
    </div>
  );
}
