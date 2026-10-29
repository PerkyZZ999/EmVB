import { Badge, Button, LayerCard, Loader, Text } from "@cloudflare/kumo";
import { LockSimpleIcon, MagicWandIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import * as React from "react";
import { summarizeLayout, type Layout, type LayoutNode } from "../../core/index.ts";
import { clipText } from "../../core/limits.ts";
import { canUseEmvb, useRole } from "../access/role.ts";
import { defaultFetcher, type Fetcher } from "../api.ts";
import { Editor } from "../editor/Editor.tsx";
import { ELEMENT_NAMES, elementIcon } from "../editor/element-chrome.ts";
import { EditorHostContext, type EditorHost } from "../editor/host.ts";
import { layerPreview } from "../editor/panels/LayersPanel.tsx";
import { BUTTON, SOLID_PRIMARY } from "../ui.ts";
import { convertEntryBody, hostEntryFromLocation } from "./convert-body.ts";
import { createFieldFetcher, FIELD_ENTRY_ID, readFieldLayout } from "./field-fetcher.ts";
import type { FieldWidgetProps } from "./LayoutField.tsx";

function describe(layout: Layout | null): string {
  const summary = summarizeLayout(layout);
  if (!summary || summary.nodes === 0) return "No layout yet";
  return `${summary.nodes} ${summary.nodes === 1 ? "element" : "elements"}`;
}

const OUTLINE_ROWS = 5;

/** W-904: the page's top-level elements, as the Layers panel names them. Text only. */
function Outline({ layout }: { layout: Layout }) {
  const children = layout.root.children ?? [];
  if (children.length === 0) return null;
  const more = children.length - OUTLINE_ROWS;
  return (
    <ol className="emvb-canvas-outline" aria-label="Top-level elements">
      {children.slice(0, OUTLINE_ROWS).map((node: LayoutNode) => {
        const Icon = elementIcon(node.type);
        const preview = layerPreview(node);
        return (
          <li key={node.id}>
            <Icon size={14} aria-hidden="true" />
            <span className="emvb-canvas-outline-name">
              {ELEMENT_NAMES[node.type] ?? "Element"}
            </span>
            {preview && <span className="emvb-canvas-outline-text">{clipText(preview, 60)}</span>}
          </li>
        );
      })}
      {more > 0 && <li className="emvb-canvas-outline-more">+{more} more</li>}
    </ol>
  );
}

const CARD_CSS = `
[data-emvb-widget="canvas"] .emvb-canvas-head { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
[data-emvb-widget="canvas"] .emvb-canvas-body { display: grid; gap: 12px; padding: 12px; }
.emvb-canvas-outline { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; font-size: 13px; line-height: 18px; }
.emvb-canvas-outline > li { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 4px 8px; border-radius: 6px; background: var(--color-kumo-tint); color: var(--text-color-kumo-default); }
.emvb-canvas-outline > li > svg { flex: none; color: var(--color-kumo-brand); }
.emvb-canvas-outline-name { flex: none; font-weight: 500; }
.emvb-canvas-outline-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-color-kumo-subtle); }
.emvb-canvas-outline > li.emvb-canvas-outline-more { background: none; color: var(--text-color-kumo-subtle); }
.emvb-canvas-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.emvb-canvas-convert-note { margin: 0; font-size: 13px; color: var(--text-color-kumo-subtle); }
.emvb-canvas-convert-note[data-emvb-convert="error"] { color: var(--text-color-kumo-danger); }
.emvb-canvas-readonly { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 13px; color: var(--text-color-kumo-subtle); }
`;

/**
 * `emvb:canvas` (W-900): a JSON field on any collection listed in `canvasCollections`, edited in
 * the full EmVB editor. Apply writes the layout back into the entry form; the entry's own Save
 * stores it, and the server checks it again (W-898). D-061: editors and above only.
 */
export function CanvasField({
  value,
  onChange,
  label,
  id,
  fetcher = defaultFetcher,
}: FieldWidgetProps & { fetcher?: Fetcher }) {
  const role = useRole(fetcher);
  const [session, setSession] = React.useState<ReturnType<typeof createFieldFetcher> | null>(null);
  const layout = readFieldLayout(value);
  const unreadable = layout === null && value !== null && value !== undefined && value !== "";
  const canEdit = role.state === "ready" && canUseEmvb(role.role);
  const close = React.useCallback(() => setSession(null), []);
  // W-912: an empty field can start from the entry's saved rich-text body.
  const entry = React.useMemo(() => hostEntryFromLocation(window.location.pathname), []);
  const [convert, setConvert] = React.useState<
    { state: "idle" } | { state: "busy" } | { state: "done" | "error"; message: string }
  >({ state: "idle" });
  const startConvert = async () => {
    if (!entry) return;
    setConvert({ state: "busy" });
    try {
      const result = await convertEntryBody(fetcher, entry);
      if (!result.ok) {
        setConvert({ state: "error", message: result.message });
        return;
      }
      const left = result.skipped > 0 ? ` ${result.skipped} left out (not supported).` : "";
      setConvert({
        state: "done",
        message: `Converted ${result.converted} ${result.converted === 1 ? "block" : "blocks"} from the entry's ${result.field} field.${left} Its original content is unchanged. Save the entry to keep the layout.`,
      });
      setSession(createFieldFetcher(fetcher, { title: label, layout: result.layout }));
    } catch {
      setConvert({ state: "error", message: "The entry's content couldn't be read. Try again." });
    }
  };
  const host = React.useMemo<EditorHost | null>(() => {
    if (!session) return null;
    const finish = (next: Layout | null | undefined) => {
      if (next !== undefined) onChange(next);
      setSession(null);
    };
    return {
      // Leave → "Save and leave" staged the layout in the session; keep it, as Apply would.
      exit: () => finish(session.saved()),
      back: { label: "Back to the entry", go: close },
      adminLinks: true,
      field: { apply: (next) => finish(next) },
    };
  }, [session, onChange, close]);
  return (
    <div
      id={id}
      role="group"
      aria-label={label}
      data-emvb-widget="canvas"
      className="flex flex-col gap-2"
    >
      <style>{CARD_CSS}</style>
      <LayerCard>
        <LayerCard.Secondary className="emvb-canvas-head">
          <span>{label}</span>
          <Badge variant={layout && !unreadable ? "blue" : "neutral"}>
            {unreadable ? "Unreadable" : describe(layout)}
          </Badge>
        </LayerCard.Secondary>
        <LayerCard.Primary className="emvb-canvas-body">
          {unreadable ? (
            <Text>This layout can't be read.</Text>
          ) : layout && (layout.root.children ?? []).length > 0 ? (
            <Outline layout={layout} />
          ) : (
            <Text variant="secondary">
              No layout yet. The entry's own content is shown instead.
            </Text>
          )}
          {role.state === "ready" && !canEdit && (
            <p className="emvb-canvas-readonly">
              <LockSimpleIcon size={14} aria-hidden="true" />
              Only editors and administrators can change this layout.
            </p>
          )}
          {canEdit && (
            <div className="emvb-canvas-actions">
              <Button
                variant="primary"
                className={BUTTON}
                style={SOLID_PRIMARY}
                icon={<PencilSimpleIcon aria-hidden="true" />}
                onClick={() => setSession(createFieldFetcher(fetcher, { title: label, layout }))}
              >
                Edit with EmVB
              </Button>
              {entry && !unreadable && (!layout || (layout.root.children ?? []).length === 0) && (
                <Button
                  variant="secondary"
                  className={`${BUTTON} emvb-canvas-convert`}
                  icon={
                    convert.state === "busy" ? (
                      <Loader size={14} />
                    ) : (
                      <MagicWandIcon aria-hidden="true" />
                    )
                  }
                  disabled={convert.state === "busy"}
                  onClick={() => void startConvert()}
                >
                  Convert to EmVB
                </Button>
              )}
            </div>
          )}
          {(convert.state === "done" || convert.state === "error") && (
            <p
              className="emvb-canvas-convert-note"
              role={convert.state === "error" ? "alert" : "status"}
              data-emvb-convert={convert.state}
            >
              {convert.message}
            </p>
          )}
        </LayerCard.Primary>
      </LayerCard>
      {/* The editor portals itself over the whole admin (EditorOverlay). */}
      {session && host && (
        <EditorHostContext.Provider value={host}>
          <Editor fetcher={session.fetcher} entryId={FIELD_ENTRY_ID} />
        </EditorHostContext.Provider>
      )}
    </div>
  );
}
