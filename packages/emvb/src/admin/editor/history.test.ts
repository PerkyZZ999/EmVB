import { describe, expect, test } from "bun:test";
import { s1Page } from "../../../test/fixtures/layouts.ts";
import { emptyDesign } from "../../core/index.ts";
import {
  emptyHistory,
  historyReducer,
  isDirty,
  type EditorHistory,
  type EditorState,
} from "./store.ts";

const initial = (): EditorState => ({
  id: "01PAGE",
  page: {
    title: "Home",
    slug: "home",
    canvasMode: "site-layout",
    seoTitle: "",
    seoDescription: "",
    layout: s1Page(),
  },
  status: "draft",
  rev: "rev1",
  design: emptyDesign(),
  designRevision: null,
  selectedId: null,
  version: 0,
  savedVersion: 0,
  lastDeleted: null,
});

const title = (history: EditorHistory) => history.present.page.title;

describe("undo and redo (W-095)", () => {
  test("undo restores the page and selection, and redo puts the edit back", () => {
    let history = emptyHistory(initial());
    history = historyReducer(history, { type: "set-page", patch: { title: "Welcome" } });
    history = historyReducer(history, { type: "select", id: "head0001" });
    history = historyReducer(history, { type: "undo" });
    expect(title(history)).toBe("Home");
    expect(history.present.selectedId).toBe(null);
    expect(isDirty(history.present)).toBe(false);
    history = historyReducer(history, { type: "redo" });
    expect(title(history)).toBe("Welcome");
    expect(history.present.selectedId).toBe("head0001");
  });

  test("a new edit drops what redo would have brought back", () => {
    let history = emptyHistory(initial());
    history = historyReducer(history, { type: "set-page", patch: { title: "A" } });
    history = historyReducer(history, { type: "set-page", patch: { title: "B" } });
    history = historyReducer(history, { type: "undo" });
    history = historyReducer(history, { type: "set-page", patch: { title: "C" } });
    const redone = historyReducer(history, { type: "redo" });
    expect(redone === history).toBe(true);
    expect(title(history)).toBe("C");
  });

  test("selection, save and design are not steps, and undo keeps the saved revision", () => {
    let history = emptyHistory(initial());
    history = historyReducer(history, { type: "set-page", patch: { title: "Welcome" } });
    history = historyReducer(history, {
      type: "saved",
      rev: "rev2",
      version: history.present.version,
    });
    history = historyReducer(history, {
      type: "set-design",
      design: history.present.design,
      revision: "d2",
    });
    history = historyReducer(history, { type: "select", id: "head0001" });
    const selected = historyReducer(history, { type: "undo" });
    expect(selected === history).toBe(false);
    expect(title(selected)).toBe("Home");
    expect(selected.present.rev).toBe("rev2");
    expect(selected.present.savedVersion).toBe(1);
    expect(selected.present.designRevision).toBe("d2");
    expect(isDirty(selected.present)).toBe(true);
    const onlySelect = historyReducer(emptyHistory(initial()), { type: "select", id: "head0001" });
    expect(historyReducer(onlySelect, { type: "undo" }) === onlySelect).toBe(true);
    expect(onlySelect.present.selectedId).toBe("head0001");
  });

  test("undo and redo at the ends of the stack change nothing", () => {
    const start = emptyHistory(initial());
    expect(historyReducer(start, { type: "undo" }) === start).toBe(true);
    expect(historyReducer(start, { type: "redo" }) === start).toBe(true);
    const edited = historyReducer(start, { type: "delete-node", id: "missing1" });
    expect(edited === start).toBe(true);
  });

  test("loading another document drops both stacks", () => {
    const edited = historyReducer(emptyHistory(initial()), {
      type: "set-page",
      patch: { title: "Welcome" },
    });
    const reset = historyReducer(edited, { type: "reset", state: initial() });
    expect(reset.past.length).toBe(0);
    expect(reset.future.length).toBe(0);
    expect(title(reset)).toBe("Home");
    expect(historyReducer(reset, { type: "undo" }) === reset).toBe(true);
  });

  test("the oldest edit falls off after 100 steps", () => {
    let history = emptyHistory(initial());
    for (let i = 1; i <= 101; i++) {
      history = historyReducer(history, { type: "set-page", patch: { title: `t${i}` } });
    }
    for (let i = 0; i < 100; i++) history = historyReducer(history, { type: "undo" });
    expect(title(history)).toBe("t1");
    expect(historyReducer(history, { type: "undo" }) === history).toBe(true);
  });
});
