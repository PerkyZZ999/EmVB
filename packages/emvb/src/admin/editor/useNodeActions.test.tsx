import { afterEach, describe, expect, test } from "bun:test";
import { createKumoToastManager } from "@cloudflare/kumo";
import * as React from "react";
import { act } from "react";
import { emptyDesign, moveDown, moveUp, REASONS, type Layout } from "../../core/index.ts";
import { container, heading } from "../../../test/fixtures/layouts.ts";
import type { EditorAction, EditorState } from "./store.ts";
import { useNodeActions } from "./useNodeActions.ts";
import { cleanup, mount as mountTree } from "../../../test/dom/mount.ts";

const layout: Layout = {
  schemaVersion: 3,
  root: container("root0001", [
    heading("head0001", "A"),
    heading("head0002", "B"),
  ]) as Layout["root"],
};

const state: EditorState = {
  id: "01PAGE",
  page: {
    title: "T",
    slug: "t",
    canvasMode: "contained",
    seoTitle: "",
    seoDescription: "",
    layout,
  },
  status: "draft",
  rev: "1",
  design: emptyDesign(),
  designRevision: null,
  selectedId: null,
  version: 0,
  savedVersion: 0,
  lastDeleted: null,
};

afterEach(cleanup);

async function mount() {
  const actions: EditorAction[] = [];
  const announced: string[] = [];
  let api: ReturnType<typeof useNodeActions> | undefined;
  function Probe() {
    const latest = React.useRef(state);
    const toasts = React.useMemo(() => createKumoToastManager(), []);
    api = useNodeActions({
      state,
      latest,
      dispatch: (action) => actions.push(action),
      announce: (message) => announced.push(message),
      toasts,
    });
    return null;
  }
  await mountTree(<Probe />);
  if (!api) throw new Error("hook did not mount");
  return { api, actions, announced };
}

describe("useNodeActions arrange (R-003)", () => {
  test("a refused move is announced and changes nothing", async () => {
    const { api, actions, announced } = await mount();
    act(() => api.arrange("head0001", moveUp));
    expect(announced).toEqual([REASONS.first]);
    expect(actions).toEqual([]);
  });

  test("an allowed move applies the arranged layout and selection", async () => {
    const { api, actions, announced } = await mount();
    act(() => api.arrange("head0001", moveDown));
    const expected = moveDown(layout, "head0001");
    if (!expected.ok) throw new Error("fixture move refused");
    expect(announced).toEqual([]);
    expect(actions).toEqual([
      { type: "apply-arranged", layout: expected.layout, selected: expected.selected },
    ]);
  });

  test("duplicating the root is refused with its reason", async () => {
    const { api, actions, announced } = await mount();
    act(() => api.duplicate("root0001"));
    expect(announced).toEqual([REASONS.rootCopy]);
    expect(actions).toEqual([]);
  });
});
