import {
  addNode,
  findNode,
  insertNode,
  moveNode,
  newNodeId,
  removeNode,
  updateNode,
  type DesignSystem,
  type LayoutNode,
  type Removed,
} from "../../core/index.ts";
import type { PageDraft } from "../content-api.ts";

/** Editor state (A-07): a pure reducer, so every edit is testable without a browser. */
export type EditorState = {
  id: string;
  page: PageDraft;
  status: string;
  rev: string | null;
  design: DesignSystem;
  designRevision: string | null;
  selectedId: string | null;
  /** Bumped on every page edit. A save only clears `dirty` if nothing changed while it ran. */
  version: number;
  savedVersion: number;
  /** The most recent delete, for the one-step Restore toast (D-025). */
  lastDeleted: Removed | null;
};

export type PagePatch = Partial<Omit<PageDraft, "layout">>;

export type EditorAction =
  | { type: "set-page"; patch: PagePatch }
  | { type: "select"; id: string | null }
  | { type: "update-node"; id: string; update: (node: LayoutNode) => LayoutNode }
  | { type: "delete-node"; id: string }
  | { type: "restore" }
  | { type: "add-root-container" }
  | { type: "add-node"; node: LayoutNode; parentId: string; index: number }
  | { type: "move-node"; id: string; parentId: string; index: number }
  | { type: "saved"; rev: string; version: number }
  | { type: "published"; rev: string }
  | { type: "set-design"; design: DesignSystem; revision: string | null }
  | { type: "reset"; state: EditorState };

export const isDirty = (state: EditorState) => state.version !== state.savedVersion;

const edited = (state: EditorState, page: PageDraft): EditorState => ({
  ...state,
  page,
  version: state.version + 1,
});

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "set-page":
      return edited(state, { ...state.page, ...action.patch });
    case "select":
      return { ...state, selectedId: action.id };
    case "update-node":
      if (!state.page.layout || !findNode(state.page.layout, action.id)) return state;
      return edited(state, {
        ...state.page,
        layout: updateNode(state.page.layout, action.id, action.update),
      });
    case "delete-node": {
      if (!state.page.layout) return state;
      const { layout, removed } = removeNode(state.page.layout, action.id);
      if (!removed) return state;
      return {
        ...edited(state, { ...state.page, layout }),
        selectedId: state.selectedId === action.id ? null : state.selectedId,
        lastDeleted: removed,
      };
    }
    case "restore": {
      const removed = state.lastDeleted;
      if (!removed || !state.page.layout) return state;
      const layout = insertNode(state.page.layout, removed.parentId, removed.index, removed.node);
      return {
        ...edited(state, { ...state.page, layout }),
        selectedId: removed.node.id,
        lastDeleted: null,
      };
    }
    case "add-root-container": {
      if (state.page.layout) return state;
      const id = newNodeId();
      return {
        ...edited(state, {
          ...state.page,
          layout: { schemaVersion: 1, root: { id, type: "container", props: {}, children: [] } },
        }),
        selectedId: id,
      };
    }
    case "add-node": {
      if (!state.page.layout) return state;
      const result = addNode(state.page.layout, action.node, {
        parentId: action.parentId,
        index: action.index,
      });
      if (!result.ok) return state;
      return {
        ...edited(state, { ...state.page, layout: result.layout }),
        selectedId: result.selected,
      };
    }
    case "move-node": {
      if (!state.page.layout) return state;
      const result = moveNode(state.page.layout, action.id, action.parentId, action.index);
      if (!result.ok) return state;
      return {
        ...edited(state, { ...state.page, layout: result.layout }),
        selectedId: result.selected,
      };
    }
    case "saved":
      return { ...state, rev: action.rev, savedVersion: action.version };
    case "published":
      return { ...state, rev: action.rev, status: "published" };
    case "set-design":
      return { ...state, design: action.design, designRevision: action.revision };
    case "reset":
      return action.state;
  }
}
