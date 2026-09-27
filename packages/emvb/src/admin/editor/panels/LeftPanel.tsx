import { Tabs } from "@cloudflare/kumo";
import * as React from "react";
import type { ElementType, Layout } from "../../../core/index.ts";
import { AddPanel } from "./AddPanel.tsx";
import { LayersPanel } from "./LayersPanel.tsx";

const SESSION_KEY = "emvb-left-tab";

/** Add | Layers left panel (W-018). Remembers the last tab for the session. */
export function LeftPanel({
  layout,
  selectedId,
  onSelect,
  onAdd,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onDelete,
  formsAvailable = true,
}: {
  layout: Layout | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (type: ElementType) => void;
  onDuplicate: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onDelete: (id: string) => void;
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
        <AddPanel onAdd={onAdd} formsAvailable={formsAvailable} />
      ) : (
        <LayersPanel
          layout={layout}
          selectedId={selectedId}
          onSelect={onSelect}
          onDuplicate={onDuplicate}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
