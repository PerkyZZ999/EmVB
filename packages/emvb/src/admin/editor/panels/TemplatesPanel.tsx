import { Button, Input } from "@cloudflare/kumo";
import * as React from "react";
import {
  LAYOUT_SCHEMA_VERSION,
  renderPage,
  resolveTemplateNode,
  SECTION_TEMPLATES,
  type DesignSystem,
  type Layout,
  type SectionTemplate,
} from "../../../core/index.ts";
import { matchesSearch } from "../../search.ts";
import { BUTTON, FIELD } from "../../ui.ts";
import { NEW_ELEMENT_MIME } from "../dnd/drop-target.ts";
import { dragStash } from "../dnd/drag-stash.ts";
import { templateDragType } from "../dnd/new-element.ts";
import { isCancelEscape } from "../ime.ts";
import { inertLinks } from "../inert-links.ts";

/** The width the preview lays a section out at before scaling it down to the tile. */
const PREVIEW_WIDTH = 1280;

const previews = new WeakMap<DesignSystem, Map<string, string>>();

type PreviewScheme = "light" | "dark";

/** The scheme the editor canvas shows Site styles in: the admin's own system setting. */
const currentScheme = (): PreviewScheme =>
  typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";

/**
 * W-1068: a template's picture, drawn by the public renderer with the site's styles. Cached per
 * design object, so typing in the search or reopening the panel never renders it again. The
 * picture is pinned to one scheme (`data-emvb-theme`, as a Theme toggle pins it), with the
 * browser's own page colours under it, so dark Site styles never land on a white page.
 */
export function templatePreviewDoc(
  template: SectionTemplate,
  design: DesignSystem,
  scheme: PreviewScheme = "light",
): string {
  let byKey = previews.get(design);
  if (!byKey) {
    byKey = new Map();
    previews.set(design, byKey);
  }
  const key = `${template.id}:${scheme}`;
  const cached = byKey.get(key);
  if (cached) return cached;
  const layout: Layout = {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    root: {
      id: "tplview0",
      type: "container",
      props: {},
      children: [resolveTemplateNode(template, design)],
    } as Layout["root"],
  };
  const { html, css } = renderPage(layout, design);
  const doc = `<!doctype html><html data-emvb-theme="${scheme}"><head><style>:root{color-scheme:${scheme}}body{margin:0;width:${PREVIEW_WIDTH}px;font-family:system-ui,sans-serif;background:Canvas;color:CanvasText}${css}</style></head><body>${inertLinks(html)}</body></html>`;
  byKey.set(key, doc);
  return doc;
}

/** Renders only once the tile scrolls near view, and scales the 1280 px page to the tile. */
function TemplatePreview({
  template,
  design,
}: {
  template: SectionTemplate;
  design: DesignSystem;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [near, setNear] = React.useState(() => typeof IntersectionObserver === "undefined");
  const [scale, setScale] = React.useState(0.2);
  React.useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const fit = () => {
      if (box.clientWidth > 0) setScale(box.clientWidth / PREVIEW_WIDTH);
    };
    fit();
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    resize?.observe(box);
    const seen =
      near || typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) setNear(true);
            },
            { rootMargin: "200px" },
          );
    seen?.observe(box);
    return () => {
      resize?.disconnect();
      seen?.disconnect();
    };
  }, [near]);
  return (
    <div ref={ref} className="emvb-template-preview" aria-hidden="true">
      {near && (
        <iframe
          title={`${template.name} preview`}
          tabIndex={-1}
          sandbox="allow-same-origin"
          srcDoc={templatePreviewDoc(template, design, currentScheme())}
          style={{ transform: `scale(${scale})` }}
        />
      )}
    </div>
  );
}

/**
 * Starter templates in the Add panel (W-1068): ready-made sections shipped with EmVB, drawn with
 * the site's Site styles. Click or Enter inserts one where the selection says; drag drops it.
 */
export function TemplatesPanel({
  design,
  onInsert,
  defaultQuery = "",
}: {
  design: DesignSystem;
  onInsert: (id: string) => void;
  /** Test-only initial search string. */
  defaultQuery?: string;
}) {
  const [query, setQuery] = React.useState(defaultQuery);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const shown = SECTION_TEMPLATES.filter((template) =>
    matchesSearch(query, template.name, template.description, "template section"),
  );
  return (
    <div className="emvb-panel-body" data-emvb-panel="templates">
      <Input
        aria-label="Search templates"
        type="search"
        className={FIELD}
        ref={searchRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (isCancelEscape(event) && query) {
            event.stopPropagation();
            setQuery("");
          }
        }}
        placeholder="Search templates…"
      />
      <p className="emvb-helper">
        Ready-made sections in your Site styles. Click or drag one onto the page; for a whole page,
        pick a page template in New page.
      </p>
      {shown.length === 0 ? (
        <div className="emvb-add-nomatch" data-emvb-add-nomatch="">
          {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a block line, as in the Add panel */}
          <p className="emvb-helper" role="status">
            No templates match &quot;{query.trim()}&quot;.
          </p>
          <Button
            type="button"
            variant="secondary"
            className={BUTTON}
            onClick={() => {
              setQuery("");
              searchRef.current?.focus();
            }}
          >
            Clear search
          </Button>
        </div>
      ) : (
        <ul className="emvb-template-list" aria-label="Section templates">
          {shown.map((template) => (
            <li key={template.id} className="emvb-template-tile">
              <TemplatePreview template={template} design={design} />
              <button
                type="button"
                className="emvb-template-insert"
                data-emvb-template={template.id}
                aria-describedby={`emvb-template-desc-${template.id}`}
                draggable
                onDragStart={(event) => {
                  const type = templateDragType(template.id);
                  event.dataTransfer.setData(NEW_ELEMENT_MIME, type);
                  event.dataTransfer.effectAllowed = "copy";
                  dragStash.new(type);
                }}
                onClick={() => onInsert(template.id)}
              >
                {template.name}
              </button>
              <p className="emvb-template-desc" id={`emvb-template-desc-${template.id}`}>
                {template.description}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
