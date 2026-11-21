import type { DragSource } from "../../../core/index.ts";
import { dragStash } from "./drag-stash.ts";
import { EXISTING_ELEMENT_MIME, NEW_ELEMENT_MIME } from "./drop-target.ts";
import { newElement } from "./new-element.ts";

/**
 * What is being dragged (canvas and Layers), or null while the browser still hides it.
 * Chromium may omit getData until drop, so the session stash wins during dragover.
 */
export function draggedSource(transfer: DataTransfer | null, existing: boolean): DragSource | null {
  if (existing) {
    const id =
      dragStash.id() ??
      (transfer?.getData(EXISTING_ELEMENT_MIME) ||
        (transfer as (DataTransfer & { emvbId?: string }) | null)?.emvbId ||
        "");
    return id ? { kind: "existing", id } : null;
  }
  const type = transfer?.getData(NEW_ELEMENT_MIME) || dragStash.type() || "";
  const node = type ? newElement(type) : null;
  return node ? { kind: "new", node } : null;
}
