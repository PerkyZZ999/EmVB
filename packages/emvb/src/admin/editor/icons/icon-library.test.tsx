import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { cleanup, mount, settle } from "../../../../test/dom/mount.ts";
import {
  columnsFor,
  IconLibraryDialog,
  moveActive,
  TILE_HEIGHT,
  GAP,
  visibleRows,
} from "./IconLibraryDialog.tsx";
import type { LibraryIcon } from "./library.ts";

afterEach(cleanup);

// W-236: the icon library dialog. Sidebar of sets, word search, a virtualized listbox grid.

async function until<T>(read: () => T | null | undefined | false, what: string): Promise<T> {
  for (let i = 0; i < 300; i += 1) {
    const value = read();
    if (value) return value;
    // oxlint-disable-next-line no-await-in-loop -- polling: each check waits for the last render
    await settle();
  }
  throw new Error(`timed out waiting for ${what}`);
}

const dialog = () => document.querySelector<HTMLElement>('[data-emvb-dialog="icon-library"]');
const grid = () => dialog()?.querySelector<HTMLElement>('[role="listbox"]') ?? null;
const statusText = () => dialog()?.querySelector('[role="status"]')?.textContent ?? "";
const shown = () =>
  [...(dialog()?.querySelectorAll('[role="option"]') ?? [])].map((el) =>
    el.getAttribute("data-emvb-icon-id"),
  );
const activeOption = () => {
  const id = grid()?.getAttribute("aria-activedescendant");
  return id ? document.getElementById(id) : null;
};
const key = async (target: Element, name: string) => {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
  });
  await settle();
};
const type = async (value: string) => {
  const input = dialog()?.querySelector<HTMLInputElement>("input");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const category = async (id: string) => {
  const button = dialog()?.querySelector<HTMLButtonElement>(`[data-emvb-icon-category="${id}"]`);
  if (!button) throw new Error(`no category ${id}`);
  await act(async () => button.click());
};
const ready = () => until(() => grid(), "the icon grid");

async function open(currentId?: string) {
  const inserted: LibraryIcon[] = [];
  const changes: boolean[] = [];
  await mount(
    <IconLibraryDialog
      open
      onOpenChange={(next) => changes.push(next)}
      currentId={currentId}
      onInsert={(icon) => inserted.push(icon)}
    />,
  );
  return { inserted, changes };
}

describe("grid arithmetic (W-236)", () => {
  test("columns fit the width; at least one", () => {
    expect(columnsFor(0)).toBe(1);
    expect(columnsFor(96)).toBe(1);
    expect(columnsFor(200)).toBe(2);
    expect(columnsFor(760)).toBe(7);
  });

  test("only the rows on screen, plus a little, are rendered; a stale offset is clamped", () => {
    const row = TILE_HEIGHT + GAP;
    expect(visibleRows(0, 480, 1000)).toEqual({ first: 0, last: 7 });
    const deep = visibleRows(row * 500, 480, 1000);
    expect(deep.first).toBeGreaterThan(490);
    expect(deep.last - deep.first).toBeLessThan(12);
    // Scrolled far down a long list, then the list became 3 rows: still show them.
    expect(visibleRows(row * 500, 480, 3)).toEqual({ first: 0, last: 2 });
  });

  test("keys move through the grid and stop at its edges", () => {
    // 10 tiles, 4 across: rows 0-3, 4-7, 8-9.
    expect(moveActive("ArrowRight", 3, 10, 4, 2)).toBe(4);
    expect(moveActive("ArrowRight", 9, 10, 4, 2)).toBe(9);
    expect(moveActive("ArrowLeft", 0, 10, 4, 2)).toBe(0);
    expect(moveActive("ArrowDown", 1, 10, 4, 2)).toBe(5);
    expect(moveActive("ArrowDown", 6, 10, 4, 2)).toBe(9);
    expect(moveActive("ArrowDown", 9, 10, 4, 2)).toBe(9);
    expect(moveActive("ArrowUp", 2, 10, 4, 2)).toBe(2);
    expect(moveActive("ArrowUp", 9, 10, 4, 2)).toBe(5);
    expect(moveActive("Home", 7, 10, 4, 2)).toBe(0);
    expect(moveActive("End", 1, 10, 4, 2)).toBe(9);
    expect(moveActive("PageDown", 1, 10, 4, 2)).toBe(9);
    expect(moveActive("PageUp", 9, 10, 4, 2)).toBe(1);
    expect(moveActive("ArrowDown", -1, 10, 4, 2)).toBe(0);
    expect(moveActive("End", -1, 10, 4, 2)).toBe(9);
    expect(moveActive("a", 1, 10, 4, 2)).toBeUndefined();
    expect(moveActive("ArrowDown", 0, 0, 4, 2)).toBeUndefined();
  });
});

describe("icon library dialog (W-236)", () => {
  test("opens on All icons with every set loaded, but renders only a screenful", async () => {
    await open();
    await ready();
    const all = dialog()?.querySelector('[data-emvb-icon-category="all"]');
    expect(all?.getAttribute("aria-current")).toBe("true");
    const labels = [...(dialog()?.querySelectorAll("[data-emvb-icon-category]") ?? [])].map(
      (el) => el.firstElementChild?.textContent,
    );
    expect(labels).toEqual([
      "All icons",
      "Lucide",
      "Font Awesome",
      "Solid",
      "Regular",
      "Brands",
      "Tabler",
      "Outline",
      "Filled",
      "Remix",
      "Line",
      "Fill",
    ]);
    const total = Number(statusText().replace(/\D/g, ""));
    expect(total).toBeGreaterThan(14_000);
    const options = dialog()?.querySelectorAll('[role="option"]') ?? [];
    expect(options.length).toBeGreaterThan(0);
    expect(options.length).toBeLessThan(200);
    expect(options[0]?.getAttribute("aria-setsize")).toBe(String(total));
    expect(options[0]?.getAttribute("aria-posinset")).toBe("1");
    // W-217: a listbox owns options; anything in between is presentational.
    const between = [...(grid()?.children ?? [])];
    expect(between.length).toBe(1);
    expect(between.every((el) => el.getAttribute("role") === "presentation")).toBe(true);
    expect(
      [...(between[0]?.children ?? [])].every((el) => el.getAttribute("role") === "option"),
    ).toBe(true);
    // The sidebar counts each set once loaded.
    const count = dialog()?.querySelector(
      '[data-emvb-icon-category="lucide"] .emvb-icon-library-count',
    );
    expect(count?.textContent).toBe("2,130");
    expect(dialog()?.textContent).toContain("Remix · Apache-2.0");
  });

  test("search matches every word in any order, within the chosen category", async () => {
    await open();
    await category("lucide");
    await ready();
    await type("right arrow");
    await until(() => shown().includes("lucide:arrow-right"), "arrow-right");
    expect(shown()).not.toContain("lucide:arrow-left");
    expect(shown().every((id) => id?.startsWith("lucide:"))).toBe(true);
    await type("ARROW   right");
    expect(shown()).toContain("lucide:arrow-right");
    await type("zzzz qqqq");
    await until(() => statusText().startsWith("No icons match"), "the empty state");
    expect(statusText()).toBe('No icons match "zzzz qqqq" in Lucide.');
  });

  test("a new search starts at its first result, not where the cursor was in the last list", async () => {
    await open("star");
    const listbox = await ready();
    await act(async () => listbox.focus());
    // The cursor is on Star, ~1,800 icons in; move it so it is the user's, not the opening one.
    await key(listbox, "ArrowDown");
    expect(Number(activeOption()?.getAttribute("aria-posinset"))).toBeGreaterThan(1000);
    await type("arrow");
    await until(() => statusText() !== "2,130 icons", "the search");
    expect(Number(statusText().replace(/\D/g, ""))).toBeGreaterThan(100);
    const first = dialog()?.querySelector('[role="option"][aria-posinset="1"]');
    expect(first?.getAttribute("data-emvb-icon-id")?.startsWith("lucide:")).toBe(true);
    expect(grid()?.getAttribute("aria-activedescendant")).toBeNull();
  });

  test("each style is its own category", async () => {
    await open();
    for (const [id, prefix] of [
      ["fontawesome/brands", "fa-brands:"],
      ["fontawesome/regular", "fa-regular:"],
      ["tabler/filled", "tabler-filled:"],
      ["remix/fill", "remix:"],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one category after another, as a user would
      await category(id);
      // oxlint-disable-next-line no-await-in-loop -- waits for this category's list
      await until(() => shown()[0]?.startsWith(prefix), id);
      expect(shown().every((icon) => icon?.startsWith(prefix))).toBe(true);
    }
    expect(shown().every((icon) => icon?.endsWith("-fill"))).toBe(true);
  });

  test("tiles are named for screen readers with their set and style", async () => {
    await open();
    await category("fontawesome/solid");
    await ready();
    await type("rocket");
    const tile = await until(
      () => dialog()?.querySelector('[data-emvb-icon-id="fa-solid:rocket"]'),
      "the rocket",
    );
    expect(tile.getAttribute("aria-label")).toBe("Rocket, Font Awesome Solid");
    expect(tile.getAttribute("aria-selected")).toBe("false");
    expect(grid()?.getAttribute("aria-label")).toBe("Solid icons");
  });

  test("reopens on the stored icon: its category, selected, in view and named in the footer", async () => {
    await open("fa-regular:heart");
    await ready();
    expect(
      dialog()
        ?.querySelector('[data-emvb-icon-category="fontawesome/regular"]')
        ?.getAttribute("aria-current"),
    ).toBe("true");
    const tile = await until(
      () => dialog()?.querySelector('[data-emvb-icon-id="fa-regular:heart"]'),
      "the heart tile",
    );
    expect(tile.getAttribute("aria-selected")).toBe("true");
    expect(activeOption()).toBe(tile as HTMLElement);
    expect(
      dialog()?.querySelector("[data-emvb-icon-picked]")?.getAttribute("data-emvb-icon-picked"),
    ).toBe("fa-regular:heart");
  });

  test("a bundled id from before the library opens on Lucide with it selected", async () => {
    await open("star");
    await ready();
    expect(
      dialog()?.querySelector('[data-emvb-icon-category="lucide"]')?.getAttribute("aria-current"),
    ).toBe("true");
    expect(
      dialog()?.querySelector('[data-emvb-icon-id="lucide:star"]')?.getAttribute("aria-selected"),
    ).toBe("true");
  });

  test("arrow keys move and select, End reaches the last tile far below, Enter inserts it", async () => {
    const { inserted, changes } = await open();
    await category("remix/line");
    const listbox = await ready();
    const columns = Number(listbox.getAttribute("data-columns"));
    await act(async () => listbox.focus());
    await settle();
    expect(activeOption()?.getAttribute("aria-posinset")).toBe("1");
    expect(activeOption()?.getAttribute("aria-selected")).toBe("false");
    await key(listbox, "ArrowRight");
    expect(activeOption()?.getAttribute("aria-posinset")).toBe("2");
    expect(activeOption()?.getAttribute("aria-selected")).toBe("true");
    await key(listbox, "ArrowDown");
    expect(activeOption()?.getAttribute("aria-posinset")).toBe(String(2 + columns));
    await key(listbox, "End");
    const last = activeOption();
    expect(last?.getAttribute("aria-posinset")).toBe(last?.getAttribute("aria-setsize"));
    const lastId = last?.getAttribute("data-emvb-icon-id");
    await key(listbox, "Enter");
    expect(inserted.map((icon) => icon.id)).toEqual([lastId ?? "?"]);
    expect(inserted[0]?.markup.startsWith("<svg")).toBe(true);
    expect(changes).toEqual([false]);
  });

  test("ArrowDown in the search moves into the grid; click selects, Insert inserts, double-click too", async () => {
    const { inserted } = await open();
    await category("tabler");
    const listbox = await ready();
    const input = dialog()?.querySelector<HTMLInputElement>("input");
    if (!input) throw new Error("no search");
    await key(input, "ArrowDown");
    expect(document.activeElement).toBe(listbox);
    const tiles = [...(dialog()?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    const third = tiles[2];
    if (!third) throw new Error("no third tile");
    await act(async () => third.click());
    expect(third.getAttribute("aria-selected")).toBe("true");
    const insert = dialog()?.querySelector<HTMLButtonElement>("[data-emvb-icon-insert]");
    expect(insert?.disabled).toBe(false);
    await act(async () => insert?.click());
    const fourth = tiles[3];
    await act(async () => {
      fourth?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(inserted.map((icon) => icon.id)).toEqual([
      third.getAttribute("data-emvb-icon-id") ?? "?",
      fourth?.getAttribute("data-emvb-icon-id") ?? "?",
    ]);
  });

  test("Insert waits for a pick; Close and Escape close without inserting", async () => {
    const { inserted, changes } = await open();
    await ready();
    const insert = dialog()?.querySelector<HTMLButtonElement>("[data-emvb-icon-insert]");
    expect(insert?.disabled).toBe(true);
    const close = [...(dialog()?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
      (b) => b.textContent?.trim() === "Close",
    );
    await act(async () => close?.click());
    expect(changes).toEqual([false]);
    // The dialog stays open here (the prop says so); Escape asks to close it again.
    await key(grid() ?? document.body, "Escape");
    expect(changes).toEqual([false, false]);
    expect(inserted).toEqual([]);
  });
});
