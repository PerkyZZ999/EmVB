import {
  addNode,
  findNode,
  insertNode,
  moveNode,
  selectionAfterDelete,
  newNodeId,
  removeNode,
  updateNode,
  type Arranged,
  type DesignSystem,
  type Layout,
  type LayoutNode,
  type Removed,
  LAYOUT_SCHEMA_VERSION,
} from "../../core/index.ts";
import { withPageHeadingLevel } from "./dnd/new-element.ts";
import type { PageDraft } from "../content-api.ts";

/** Editor state (A-07): a pure reducer, so every edit is testable without a browser. */
export type EditorState = {
  id: string;
  page: PageDraft;
  status: string;
  rev: string | null;
  design: DesignSystem;
  designRevision: string | null;
  /** CAS token for the published design. Absent until the editor has loaded a draft (W-100). */
  publishedRevision?: string | null;
  /** True after a style edit that has not been published. */
  designUnpublished?: boolean;
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
  | { type: "apply-arranged"; layout: Layout; selected: string }
  | { type: "saved"; rev: string; version: number }
  | { type: "published"; rev: string }
  | { type: "set-design"; design: DesignSystem; revision: string | null }
  | { type: "publish-design"; revision: string }
  | { type: "reset"; state: EditorState };

export const isDirty = (state: EditorState) => state.version !== state.savedVersion;

const edited = (state: EditorState, page: PageDraft): EditorState => ({
  ...state,
  page,
  version: state.version + 1,
});

/** A layout edit that also moves the selection. */
const withLayout = (
  state: EditorState,
  layout: Layout,
  selectedId: string | null,
  lastDeleted = state.lastDeleted,
): EditorState => ({ ...edited(state, { ...state.page, layout }), selectedId, lastDeleted });

/** Applies an arrange result; a refused one leaves the state unchanged. */
const arranged = (state: EditorState, result: Arranged): EditorState =>
  result.ok ? withLayout(state, result.layout, result.selected) : state;

/** Page edits kept for undo. Save, publish and design stay on the live state (D-035, proposed). */
const PAGE_HISTORY_LIMIT = 100;

type PageSnapshot = {
  page: PageDraft;
  selectedId: string | null;
  lastDeleted: Removed | null;
  version: number;
};

export type EditorHistory = {
  present: EditorState;
  past: readonly PageSnapshot[];
  future: readonly PageSnapshot[];
};

export type HistoryAction = EditorAction | { type: "undo" } | { type: "redo" };

const snapshotOf = (state: EditorState): PageSnapshot => ({
  page: state.page,
  selectedId: state.selectedId,
  lastDeleted: state.lastDeleted,
  version: state.version,
});

const withSnapshot = (state: EditorState, snap: PageSnapshot): EditorState => ({
  ...state,
  page: snap.page,
  selectedId: snap.selectedId,
  lastDeleted: snap.lastDeleted,
  version: snap.version,
});

export const emptyHistory = (present: EditorState): EditorHistory => ({
  present,
  past: [],
  future: [],
});

/**
 * Wraps `editorReducer`. A page edit (version bump) pushes the previous page onto `past` and
 * clears `redo`. Selection, save, publish and design updates replace `present` only. `reset`
 * drops both stacks. Undo restores the page and leaves the current revision and saved version.
 */
export function historyReducer(history: EditorHistory, action: HistoryAction): EditorHistory {
  if (action.type === "undo") {
    const snap = history.past.at(-1);
    if (!snap) return history;
    return {
      present: withSnapshot(history.present, snap),
      past: history.past.slice(0, -1),
      future: [snapshotOf(history.present), ...history.future],
    };
  }
  if (action.type === "redo") {
    const snap = history.future.at(0);
    if (!snap) return history;
    return {
      present: withSnapshot(history.present, snap),
      past: [...history.past, snapshotOf(history.present)],
      future: history.future.slice(1),
    };
  }
  if (action.type === "reset") return emptyHistory(action.state);
  const next = editorReducer(history.present, action);
  if (next === history.present) return history;
  if (next.version === history.present.version) return { ...history, present: next };
  const past = [...history.past, snapshotOf(history.present)];
  return {
    present: next,
    past: past.length > PAGE_HISTORY_LIMIT ? past.slice(-PAGE_HISTORY_LIMIT) : past,
    future: [],
  };
}

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
      const nextSelected =
        state.selectedId === action.id
          ? selectionAfterDelete(state.page.layout, action.id)
          : state.selectedId;
      const { layout, removed } = removeNode(state.page.layout, action.id);
      if (!removed) return state;
      return withLayout(state, layout, nextSelected, removed);
    }
    case "restore": {
      const removed = state.lastDeleted;
      if (!removed || !state.page.layout) return state;
      const layout = insertNode(state.page.layout, removed.parentId, removed.index, removed.node);
      return withLayout(state, layout, removed.node.id, null);
    }
    case "add-root-container": {
      if (state.page.layout) return state;
      const id = newNodeId();
      const root = { id, type: "container" as const, props: {}, children: [] };
      return withLayout(state, { schemaVersion: LAYOUT_SCHEMA_VERSION, root }, id);
    }
    case "add-node": {
      if (!state.page.layout) return state;
      const place = { parentId: action.parentId, index: action.index };
      const node = withPageHeadingLevel(action.node, state.page.layout);
      return arranged(state, addNode(state.page.layout, node, place));
    }
    case "move-node":
      if (!state.page.layout) return state;
      return arranged(state, moveNode(state.page.layout, action.id, action.parentId, action.index));
    case "apply-arranged":
      return withLayout(state, action.layout, action.selected);
    case "saved":
      // A saved draft on a published entry is not live until Publish (W-190).
      return {
        ...state,
        rev: action.rev,
        savedVersion: action.version,
        status: state.status === "published" ? "changed" : state.status,
      };
    case "published":
      return { ...state, rev: action.rev, status: "published" };
    case "set-design":
      return {
        ...state,
        design: action.design,
        designRevision: action.revision,
        designUnpublished: true,
      };
    case "publish-design":
      return { ...state, designUnpublished: false, publishedRevision: action.revision };
    case "reset":
      return action.state;
  }
}
