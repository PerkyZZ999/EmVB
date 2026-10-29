import { Button, Text } from "@cloudflare/kumo";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import * as React from "react";
import { summarizeLayout, type Layout } from "../../core/index.ts";
import { canUseEmvb, useRole } from "../access/role.ts";
import { defaultFetcher, type Fetcher } from "../api.ts";
import { Editor } from "../editor/Editor.tsx";
import { EditorHostContext, type EditorHost } from "../editor/host.ts";
import { BUTTON } from "../ui.ts";
import { createFieldFetcher, FIELD_ENTRY_ID, readFieldLayout } from "./field-fetcher.ts";
import type { FieldWidgetProps } from "./LayoutField.tsx";

function describe(layout: Layout | null): string {
  const summary = summarizeLayout(layout);
  if (!summary || summary.nodes === 0) return "No layout yet.";
  return `${summary.nodes} ${summary.nodes === 1 ? "element" : "elements"}`;
}

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
      <Text variant="secondary">{label}</Text>
      <Text>{unreadable ? "This layout can't be read." : describe(layout)}</Text>
      {role.state === "ready" && !canEdit && (
        <Text variant="secondary">Only editors and administrators can change this layout.</Text>
      )}
      {canEdit && (
        <div>
          <Button
            variant="secondary"
            className={BUTTON}
            icon={<PencilSimpleIcon aria-hidden="true" />}
            onClick={() => setSession(createFieldFetcher(fetcher, { title: label, layout }))}
          >
            Edit with EmVB
          </Button>
        </div>
      )}
      {/* The editor portals itself over the whole admin (EditorOverlay). */}
      {session && host && (
        <EditorHostContext.Provider value={host}>
          <Editor fetcher={session.fetcher} entryId={FIELD_ENTRY_ID} />
        </EditorHostContext.Provider>
      )}
    </div>
  );
}
