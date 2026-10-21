import { Tabs } from "@cloudflare/kumo";
import * as React from "react";
import type { ElementType, Layout } from "../../../core/index.ts";
import { AddPanel } from "./AddPanel.tsx";
import { LayersPanel } from "./LayersPanel.tsx";
import type { ClipboardActions } from "../useClipboardActions.ts";
import type { SavedSectionActions } from "../useSavedSections.ts";

const SESSION_KEY = "emvb-left-tab";

/** Add | Layers left panel (W-018). Remembers the last tab for the session. */
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
}: {
  layout: Layout | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (type: ElementType) => void;
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
}) {
  const [tab, setTab] = React.useState(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) === "layers" ? "layers" : "add";
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
  return (
    <div className="emvb-panel-body emvb-left-panel">
      <Tabs
        variant="underline"
        className="emvb-tabs"
        tabs={[
          { value: "add", label: "Add" },
          { value: "layers", label: "Layers" },
        ]}
        value={tab}
        onValueChange={changeTab}
      />
      {tab === "add" ? (
        <AddPanel onAdd={onAdd} onRecipe={onRecipe} saved={saved} formsAvailable={formsAvailable} />
      ) : (
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
        />
      )}
    </div>
  );
}
