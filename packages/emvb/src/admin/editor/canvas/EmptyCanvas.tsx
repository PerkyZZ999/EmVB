import { PlusIcon } from "@phosphor-icons/react";
import type * as React from "react";
import { NEW_ELEMENT_MIME } from "../dnd/drop-target.ts";
import { newElement } from "../dnd/new-element.ts";
import type { EditorAction, EditorState } from "../store.ts";

/** The canvas of a page with no layout yet: a prompt and a drop zone that starts one (R-002). */
export function EmptyCanvas({
  latest,
  dispatch,
}: {
  latest: React.RefObject<EditorState>;
  dispatch: React.Dispatch<EditorAction>;
}) {
  return (
    <div
      className="emvb-empty-canvas"
      data-emvb-empty-canvas=""
      onDragOver={(event) => {
        if (![...event.dataTransfer.types].includes(NEW_ELEMENT_MIME)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        event.preventDefault();
        const type = event.dataTransfer.getData(NEW_ELEMENT_MIME);
        if (!type) return;
        dispatch({ type: "add-root-container" });
        if (type === "container") return;
        queueMicrotask(() => {
          const layout = latest.current.page.layout;
          if (!layout) return;
          const node = newElement(type);
          if (!node) return;
          dispatch({ type: "add-node", node, parentId: layout.root.id, index: 0 });
        });
      }}
    >
      <button
        type="button"
        className="emvb-empty-prompt"
        onClick={() => dispatch({ type: "add-root-container" })}
      >
        <PlusIcon size={16} aria-hidden="true" />
        Add a container to start
      </button>
    </div>
  );
}
