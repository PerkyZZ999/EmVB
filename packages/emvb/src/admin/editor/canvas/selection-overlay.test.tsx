import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { ClipboardActions } from "../useClipboardActions.ts";
import type { CanvasSelection } from "./CanvasFrame.tsx";
import { SelectionOverlay, toolbarAt } from "./SelectionOverlay.tsx";
import { cleanup, mount, settle } from "../../../../test/dom/mount.ts";

let calls: string[] = [];

afterEach(async () => {
  await cleanup();
  calls = [];
});

const BOX = { top: 40, left: 10, width: 200, height: 50 };

function selection(clipboard?: ClipboardActions): CanvasSelection {
  return {
    selectedId: "head0001",
    labelFor: () => "Heading",
    canDelete: () => true,
    canMove: () => true,
    canDuplicate: () => true,
    onSelect: () => undefined,
    onDelete: () => undefined,
    onDuplicate: () => undefined,
    onKeyDown: () => undefined,
    clipboard,
  };
}

const clipboard = (blocked: { paste: string | null; style: string | null }): ClipboardActions => ({
  copy: (id) => calls.push(`copy:${id}`),
  copyStyle: (id) => calls.push(`copy-style:${id}`),
  paste: (id) => calls.push(`paste:${id}`),
  pasteStyle: (id) => calls.push(`paste-style:${id}`),
  pasteBlocked: blocked.paste,
  pasteStyleBlocked: blocked.style,
});

const trigger = () => document.querySelector<HTMLElement>('[aria-label="Copy and paste"]');
const item = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (el) => el.textContent === label,
  );

async function open() {
  expect(trigger()?.outerHTML ?? null).not.toBeNull();
  await act(async () => trigger()?.click());
  await settle();
}

async function pick(label: string) {
  await open();
  await act(async () => item(label)?.click());
  await settle();
  return calls.at(-1);
}

describe("canvas quick actions: copy and paste (W-093)", () => {
  test("the menu copies, pastes, copies style and pastes style on the selected element", async () => {
    await mount(
      <SelectionOverlay
        hover={null}
        selected={BOX}
        selectedId="head0001"
        selection={selection(clipboard({ paste: null, style: null }))}
      />,
    );
    expect(await pick("Copy")).toBe("copy:head0001");
    expect(await pick("Paste")).toBe("paste:head0001");
    expect(await pick("Copy style")).toBe("copy-style:head0001");
    expect(await pick("Paste style")).toBe("paste-style:head0001");
  });

  test("with nothing copied the paste items are off, with the reason", async () => {
    await mount(
      <SelectionOverlay
        hover={null}
        selected={BOX}
        selectedId="head0001"
        selection={selection(
          clipboard({
            paste: "Copy an element first.",
            style: "Copy an element or a style first.",
          }),
        )}
      />,
    );
    await open();
    const off = (label: string) =>
      item(label)?.hasAttribute("data-disabled") ||
      item(label)?.getAttribute("aria-disabled") === "true";
    expect(off("Paste")).toBe(true);
    expect(off("Paste style")).toBe(true);
    expect(off("Copy")).toBe(false);
    expect(document.querySelector("[data-emvb-paste-hint]")?.textContent ?? null).toBe(
      "Copy an element or a style first.",
    );
    await act(async () => item("Paste")?.click());
    await settle();
    expect(calls).toEqual([]);
  });

  test("without clipboard actions there is no copy and paste button", async () => {
    await mount(
      <SelectionOverlay
        hover={null}
        selected={BOX}
        selectedId="head0001"
        selection={selection()}
      />,
    );
    expect(trigger()?.outerHTML ?? null).toBeNull();
  });
});

describe("the selected element's toolbar sits inside its outline (W-131)", () => {
  const toolbar = () => document.querySelector<HTMLElement>("[data-emvb-toolbar]");
  const render = (box: typeof BOX, editing = false) =>
    mount(
      <SelectionOverlay
        hover={null}
        selected={box}
        selectedId="head0001"
        selection={selection()}
        editing={editing}
      />,
    );

  test("a tall element gets the toolbar in its top-left corner", async () => {
    await render({ top: 120, left: 30, width: 400, height: 200 });
    expect([toolbar()?.style.top, toolbar()?.style.left]).toEqual(["122px", "32px"]);
  });

  test("a short element keeps it above, or below at the top of the canvas", () => {
    expect(toolbarAt({ top: 120, left: 30, width: 400, height: 30 })).toEqual({
      top: 94,
      left: 30,
    });
    expect(toolbarAt({ top: 4, left: 30, width: 400, height: 30 })).toEqual({ top: 34, left: 30 });
  });

  test("it stays in view while a tall element scrolls up, and goes outside while editing text", () => {
    expect(toolbarAt({ top: -300, left: 0, width: 400, height: 600 })).toEqual({ top: 2, left: 2 });
    expect(toolbarAt({ top: -580, left: 0, width: 400, height: 600 })).toEqual({
      top: -8,
      left: 2,
    });
    expect(toolbarAt({ top: 120, left: 30, width: 400, height: 200 }, true)).toEqual({
      top: 94,
      left: 30,
    });
  });
});
