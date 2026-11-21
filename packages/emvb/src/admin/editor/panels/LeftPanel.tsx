import { Tabs } from "@cloudflare/kumo";
import * as React from "react";
import type { ElementType, Layout } from "../../../core/index.ts";
import { AddPanel } from "./AddPanel.tsx";
import { LayersPanel } from "./LayersPanel.tsx";
import { CoDesignPanel } from "./CoDesignPanel.tsx";
import type { CoDesign } from "../useCoDesign.ts";
import { ExtensionPanels } from "../extensions/ExtensionPanels.tsx";
import type { ClipboardActions } from "../useClipboardActions.ts";
import type { SavedSectionActions } from "../useSavedSections.ts";
import { transferKinds } from "../dnd/drop-target.ts";
import { TAB_SPRING_MS } from "../dnd/layer-drop.ts";
import type { LayersDropCallbacks } from "./use-layers-drop.ts";

const SESSION_KEY = "emvb-left-tab";

const overLayersTab = (target: EventTarget | null) =>
  target instanceof Element && target.closest('[role="tab"]')?.textContent?.trim() === "Layers";

/** Add | Layers | Agent left panel (W-018, W-930). Remembers the last tab for the session. */
export function LeftPanel({
  layout,
  selectedId,
  onSelect,
  onAdd,
  onRecipe,
  saved,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onDelete,
  clipboard,
  onRename,
  onSaveSection,
  formsAvailable = true,
  coDesign,
  onDropNew,
  onMoveTo,
}: {
  layout: Layout | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (type: ElementType | string) => void;
  /** Adds a section recipe (W-320). */
  onRecipe?: (id: string) => void;
  /** My sections (W-876). */
  saved?: SavedSectionActions;
  onDuplicate: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onDelete: (id: string) => void;
  clipboard?: ClipboardActions;
  /** Layers rename (W-157). */
  onRename?: (id: string, label: string | undefined) => void;
  /** Save as section in the row menu (W-876). */
  onSaveSection?: (id: string) => void;
  formsAvailable?: boolean;
  /** W-930: agent proposals to review; the Agent tab shows only with it. */
  coDesign?: CoDesign;
} & LayersDropCallbacks) {
  const [tab, setTab] = React.useState(() => {
    try {
      const last = sessionStorage.getItem(SESSION_KEY);
      return last === "layers" || (last === "agent" && coDesign) ? last : "add";
    } catch {
      return "add";
    }
  });
  const changeTab = (value: string) => {
    setTab(value);
    try {
      sessionStorage.setItem(SESSION_KEY, value);
    } catch {
      /* private mode */
    }
  };
  // W-1080: dragging an Add tile over the Layers tab opens Layers, so the tile can be dropped
  // between rows. The Add panel stays mounted (hidden) until the drag ends: a removed drag
  // source gets no dragend, which would leave the drag stash set.
  const [dragFromAdd, setDragFromAdd] = React.useState(false);
  const spring = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopSpring = React.useCallback(() => {
    if (spring.current) clearTimeout(spring.current);
    spring.current = null;
  }, []);
  // Entering anything but the tab (its own children count as the tab) cancels the switch.
  // dragleave can't: it fires after the dragenter of the tab's inner label.
  React.useEffect(() => {
    const enter = (event: DragEvent) => {
      if (!overLayersTab(event.target)) stopSpring();
    };
    document.addEventListener("dragenter", enter);
    return () => {
      document.removeEventListener("dragenter", enter);
      stopSpring();
    };
  }, [stopSpring]);
  React.useEffect(() => {
    if (!dragFromAdd) return;
    const end = () => setDragFromAdd(false);
    window.addEventListener("dragend", end);
    window.addEventListener("drop", end);
    return () => {
      window.removeEventListener("dragend", end);
      window.removeEventListener("drop", end);
    };
  }, [dragFromAdd]);
  // Playwright's and some browsers' drags send dragenter rather than a stream of dragover, so
  // both start the switch.
  const springOver = (event: React.DragEvent) => {
    const kinds = transferKinds(event.dataTransfer);
    if ((!kinds.neu && !kinds.existing) || !overLayersTab(event.target)) {
      stopSpring();
      return;
    }
    if (spring.current) return;
    spring.current = setTimeout(() => {
      spring.current = null;
      if (tab === "add") setDragFromAdd(true);
      changeTab("layers");
    }, TAB_SPRING_MS);
  };
  const springProps =
    tab !== "layers" && (onDropNew || onMoveTo)
      ? { onDragEnter: springOver, onDragOver: springOver }
      : {};
  const showAgent = tab === "agent" && !!coDesign;
  const showAdd = !showAgent && tab === "add";
  const addPanel = (
    <>
      <AddPanel onAdd={onAdd} onRecipe={onRecipe} saved={saved} formsAvailable={formsAvailable} />
      <ExtensionPanels />
    </>
  );
  return (
    <div className="emvb-panel-body emvb-left-panel">
      <div className="emvb-left-tabs" data-emvb-left-tabs="" {...springProps}>
        <Tabs
          variant="underline"
          className="emvb-tabs"
          tabs={[
            { value: "add", label: "Add" },
            { value: "layers", label: "Layers" },
            ...(coDesign
              ? [
                  {
                    value: "agent",
                    label:
                      coDesign.proposals.items.length > 0
                        ? `Agent (${coDesign.proposals.items.length})`
                        : "Agent",
                  },
                ]
              : []),
          ]}
          value={tab}
          onValueChange={changeTab}
        />
      </div>
      {showAgent && coDesign && <CoDesignPanel co={coDesign} layout={layout} />}
      {/* One slot for Add whether shown or held, so React keeps the dragged tile's node. */}
      {(showAdd || dragFromAdd) && (
        <div
          className="emvb-add-holder"
          data-emvb-add-held={showAdd ? undefined : ""}
          hidden={!showAdd}
          style={showAdd ? { display: "contents" } : undefined}
        >
          {addPanel}
        </div>
      )}
      {!showAgent && !showAdd && (
        <LayersPanel
          layout={layout}
          selectedId={selectedId}
          onSelect={onSelect}
          onDuplicate={onDuplicate}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onDelete={onDelete}
          clipboard={clipboard}
          onRename={onRename}
          onSaveSection={onSaveSection}
          onDropNew={onDropNew}
          onMoveTo={onMoveTo}
        />
      )}
    </div>
  );
}
