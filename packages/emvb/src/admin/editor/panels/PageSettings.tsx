import { Button, Collapsible, Input, Select } from "@cloudflare/kumo";
import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import * as React from "react";
import {
  defaultFloatSettings,
  FLOAT_EDGES,
  THEME_PART_TYPE_LABELS,
  type ThemePartType,
  type FloatEdge,
  type LayoutNode,
} from "../../../core/index.ts";
import type { Fetcher } from "../../api.ts";
import { canonicalProblem, type PageDraft } from "../../content-api.ts";
import { BUTTON, FIELD } from "../../ui.ts";
import type { PagePatch } from "../store.ts";
import { ConditionsEditor } from "./ConditionsEditor.tsx";
import { HintedSwitch } from "./settings/HintedSwitch.tsx";
import { MediaPicker } from "./settings/MediaPicker.tsx";
import { TriggersEditor } from "./TriggersEditor.tsx";

const LAYOUTS = [
  { value: "site-layout", label: "Site layout" },
  { value: "blank", label: "Blank" },
];

/** Where each reusable part is used, said in place of display conditions (UX-061). */
const ITEM_PART_USE: Partial<Record<ThemePartType, string>> = {
  loop_item:
    "Loop elements show this part for each entry they list, so it has no display conditions.",
  section:
    "Theme section elements show this part wherever you place them, so it has no display conditions.",
  page_template:
    "New page offers this layout as a starting point, so it has no display conditions.",
};

/** Right panel with nothing selected (IA): page settings or theme-part settings. */
export function PageSettings({
  page,
  slugError,
  onChange,
  kind = "page",
  fetcher,
}: {
  page: PageDraft;
  slugError: string | null;
  onChange: (patch: PagePatch) => void;
  kind?: "page" | "theme-part";
  /** For the Social image picker (W-287); without it the field isn't offered. */
  fetcher?: Fetcher;
}) {
  // Hooks run before the theme-part branch, so switching `kind` keeps the hook order (W-092).
  const descriptionId = React.useId();
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
        {ITEM_PART_USE[page.partType ?? "header"] ? (
          // UX-061: item parts never match a page location, so conditions would change nothing.
          <p className="emvb-helper" data-emvb-item-part-note="">
            {ITEM_PART_USE[page.partType ?? "header"]}
          </p>
        ) : (
          <ConditionsEditor
            conditions={page.conditions}
            onChange={(conditions) => onChange({ conditions })}
          />
        )}
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

  const seoCount = [
    page.seoTitle.trim(),
    page.seoDescription.trim(),
    page.seoCanonical?.trim(),
    page.seoNoIndex,
    page.seoImage?.trim(),
  ].filter(Boolean).length;
  const canonicalError = canonicalProblem(page.seoCanonical ?? "");
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
          {/* UX-021: a description runs to about 150 characters, so it gets room and a count. */}
          <div className="emvb-field-group">
            <label className="emvb-field-label" htmlFor={descriptionId}>
              Meta description
            </label>
            <textarea
              id={descriptionId}
              dir="auto"
              className={`${FIELD} emvb-textarea`}
              rows={3}
              maxLength={500}
              aria-describedby={`${descriptionId}-count`}
              value={page.seoDescription}
              onChange={(event) => onChange({ seoDescription: event.target.value })}
            />
            <p className="emvb-helper" id={`${descriptionId}-count`} data-emvb-seo-count="">
              {page.seoDescription.length} characters. Search results show about 150.
            </p>
          </div>
          {/* W-284: EmDash stores these; the public page prints them (W-274). */}
          <Input
            label="Canonical URL"
            type="url"
            className={FIELD}
            maxLength={500}
            value={page.seoCanonical ?? ""}
            placeholder="https://"
            error={canonicalError ?? undefined}
            onChange={(event) => onChange({ seoCanonical: event.target.value })}
          />
          <p className="emvb-helper">
            Only if this page copies another one: the address search engines should list instead.
          </p>
          {fetcher && (
            <div data-emvb-seo-image="">
              {/* W-287: the Image element's picker on a stand-in node; only `src` is kept. */}
              <MediaPicker
                label="Social image"
                node={
                  {
                    id: "seo-image",
                    type: "image",
                    props: { src: page.seoImage ?? "" },
                  } as LayoutNode
                }
                fetcher={fetcher}
                onChange={(next) => {
                  const src = (next.props as { src?: unknown }).src;
                  onChange({ seoImage: typeof src === "string" ? src : "" });
                }}
              />
              <p className="emvb-helper">
                Shown when the page is shared on social sites. 1200 × 630 px works best.
              </p>
              {page.seoImage?.trim() && (
                <Button
                  type="button"
                  variant="secondary"
                  className={BUTTON}
                  onClick={() => onChange({ seoImage: "" })}
                >
                  Remove social image
                </Button>
              )}
            </div>
          )}
          <HintedSwitch
            label="Hide from search engines"
            checked={page.seoNoIndex === true}
            onCheckedChange={(checked) => onChange({ seoNoIndex: checked })}
            hint="Search engines are asked not to list this page or follow its links (noindex, nofollow)."
            hintData={{ "data-emvb-noindex-help": "" }}
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
    // UX-061: the panel's field rhythm, and the note described by the Place select.
    <div className="emvb-field-group" data-emvb-panel="float">
      <Select
        label="Place"
        className={FIELD}
        value={settings.edge}
        description="A bar stays on that edge and leaves room for the page. A corner sits over the page."
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
      <HintedSwitch
        label="Close button"
        checked={settings.dismiss}
        onCheckedChange={(checked) => onChange({ ...settings, dismiss: checked })}
        hint="Closing hides it until the next visit. Nothing is stored in a cookie."
      />
    </div>
  );
}
